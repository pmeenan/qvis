<template>
    <div>
        <!-- <div>ManualRTT: {{config.manualRTT}}</div>
        <div>Scale: {{config.scale}}</div> -->

        <div id="sequence-diagram" style="width: 100%; border:5px solid #cce5ff; min-height: 200px;">
            <svg id="sequence-diagram-svg">
                
            </svg>
        </div>
        <div v-if="eventModalShown" id="event-modal" class="modal fade show d-block" tabindex="-1" role="dialog" aria-modal="true" @click.self="hideEventModal">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Event detail</h5>
                        <button type="button" class="btn-close" aria-label="Close" @click="hideEventModal"></button>
                    </div>
                    <div class="modal-body">
                        <div v-if="eventLink !== null">
                            <a :href="eventLink" target="_blank">Direct link to this event</a><br/>
                            <hr>
                        </div>
                        <pre class="d-block">{{ eventDetail }}</pre>
                        <!-- TODO: make this configurable: not all extra data will be recovery-metric related down the line! -->
                        <p style="font-weight: bold;" v-if="eventDetailExtra !== null">Value of all recovery metrics at this point:</p>
                        <pre v-if="eventDetailExtra !== null" class="d-block">{{ eventDetailExtra }}</pre>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary mt-3" @click="hideEventModal">Close</button>
                    </div>
                </div>
            </div>
        </div>
        <div v-if="eventModalShown" class="modal-backdrop fade show"></div>
    </div>
</template> 

<style>
    #sequence-diagram-svg text.timestamp {
        font-size: 11px;
    }
</style> 

<script lang="ts">
    import { defineComponent, markRaw, type PropType } from "vue";
    import { notify } from "@kyvg/vue3-notification";
    import SequenceDiagramConfig from "./data/SequenceDiagramConfig";
    import { SequenceDiagramD3Renderer, EventPointer } from "./renderer/SequenceDiagramD3Renderer";

    export default defineComponent({
        name: "SequenceDiagramRenderer",
        props: {
            config: {
                type: Object as PropType<SequenceDiagramConfig>,
                required: true,
            },
        },
        data() {
            return {
                eventDetail: "",
                eventDetailExtra: null as string | null,
                eventLink: null as string | null,
                eventModalShown: false,
                focusOnNext: null as EventPointer | null,
                renderer: undefined as SequenceDiagramD3Renderer | undefined,
            };
        },
        computed: {
            connections() {
                return this.config.connections;
            },
        },
        created() {
            this.renderer = markRaw(new SequenceDiagramD3Renderer("sequence-diagram", "sequence-diagram-svg", this.showEventModal));
            // this.renderer = new SequenceDiagramCanvasRenderer("sequence-diagram");

            const queryParameters = Object.fromEntries(new URLSearchParams((window.location.hash.split("?")[1] || "").split("#")[0]));

            if ( queryParameters.focusOnConnection && queryParameters.focusOnEvent ) {
                this.focusOnNext = { connectionIndex: parseInt(queryParameters.focusOnConnection as string, 10), eventIndex: parseInt(queryParameters.focusOnEvent as string, 10) };
            }
            else if ( queryParameters.focusOnPN ) {
                
                let connectionIndex = 0;
                if ( queryParameters.focusOnConnection ) {
                    connectionIndex = parseInt(queryParameters.focusOnConnection as string, 10);
                }

                this.focusOnNext = { connectionIndex: connectionIndex, packetNumber: parseInt(queryParameters.focusOnPN as string, 10) };
            }
        },

        mounted() {
            // mainly for when we switch away, and then back to the sequenceDiagram
            if ( this.config && this.renderer && this.config.connections.length > 0 ) {
                this.renderer.render( this.config.connections, this.config.timeResolution );
            }
        },
        methods: {

        hideEventModal() {
            this.eventModalShown = false;
        },

        showEventModal(event: any, extra: any) {

            this.eventDetail = JSON.stringify(event, null, 2);
            if ( extra !== undefined ) {
                this.eventDetailExtra = JSON.stringify( extra, null , 2);
            }
            else {
                this.eventDetailExtra = null;
            }

            // const metadata = (event as any);
            let eventNr = undefined;
            if ( event.qvis && event.qvis.sequencediagram && event.qvis.sequencediagram.focusInfo ) {
                const focusInfo:EventPointer = event.qvis.sequencediagram.focusInfo as EventPointer;
                eventNr = focusInfo.eventIndex;
                
                const traces = this.renderer!.getTraces();

                const URLs:Array<string> = [];

                for ( const ctrace of traces ) {
                    if ( ctrace.connection && ctrace.connection.parent && ctrace.connection.parent.URL ) {
                        if ( URLs.indexOf(ctrace.connection.parent.URL) < 0 ) {
                            URLs.push( ctrace.connection.parent.URL );
                        }
                    }
                }

                const trace = traces[ focusInfo.connectionIndex ];
                if ( trace && URLs.length > 0 ) {

                    let fileLinks = "";
                    if ( URLs.length === 1 ) {
                        fileLinks = "file=" + URLs[0];
                    }
                    else {
                        for ( let i = 0; i < URLs.length; ++i ) {
                            fileLinks += "file" + (i + 1) + "=" + URLs[i];
                            if ( i !== URLs.length - 1 ) {
                                fileLinks += "&";
                            }
                        }
                    }

                    if ( trace.connection && trace.connection.parent && trace.connection.parent.URL ) {
                        this.eventLink = "https://qvis.quictools.info?#/sequence?" + fileLinks + "&focusOnConnection=" + focusInfo.connectionIndex + "&focusOnEvent=" + focusInfo.eventIndex;
                    }
                    else {
                        this.eventLink = null;
                    }
                }
                else {
                    this.eventLink = null;
                    console.error("SequenceDiagramRenderer:showEventModal : trying to focus on trace, but doesn't exist: ", focusInfo, traces );
                }
            }
            else {
                this.eventLink = null;
            }

            if ( eventNr !== undefined ) {
                this.eventDetail = "Event nr: " + eventNr + "\n" + this.eventDetail;
            }
            
            this.eventModalShown = true;
        },
        },
        watch: {
            config: {
                immediate: true,
                deep: true,
                async handler(newConfig: SequenceDiagramConfig, oldConfig: SequenceDiagramConfig) {
                    console.log("SequenceDiagramRenderer:onConfigChanged : ", newConfig, oldConfig);

                    if ( this.renderer ) {

                        // Because of the Vue reactivity, we come into this function multiple times but we just want to do the first
                        // so the .rendering var helps deal with that
                        // TODO: fix this OR bring this logic into this component, rather than on the renderer
                        if ( !this.renderer.rendering ){

                            if ( newConfig.connections && newConfig.connections[0]?.connection.getEvents().length > 10000 ){
                                notify({
                                    group: "default",
                                    title: "Trace might take long to render",
                                    type: "warn",
                                    text: "Some large traces can take a long time to render. Please be patient.",
                                });

                                // give time to show the warning
                                await new Promise( (resolve) => setTimeout(resolve, 200));
                            }

                            this.renderer.render( newConfig.connections, newConfig.timeResolution, this.focusOnNext ).then( (rendered) => {
                                
                                this.focusOnNext = null; // don't want to keep focusing on the same thing if we've changed selection
                                
                                if ( !rendered ) {
                                    notify({
                                        group: "default",
                                        title: "Trace could not be rendered",
                                        type: "error",
                                        text: "This trace could not be rendered. There could be an error or a previous file was still rendering.<br/>See the JavaScript devtools for more information.",
                                    });
                                }
                            });
                        }
                    }
                },
            },
        },
    });

</script>
