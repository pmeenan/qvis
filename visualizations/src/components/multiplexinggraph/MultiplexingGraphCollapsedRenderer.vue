<template>
    <div id="multiplexingToplevelContainer" class="container-fluid" style="width: 100%;">
        <div class="row align-items-center" style="text-align: center;">
            <div class="col-12">
                <h4>{{(connection !== undefined) ? connection.parent.filename + " : " + connection.getLongName() : ""}}</h4>
            </div>
        </div>
        <div v-if="showstreamdetail" class="row align-items-center" style="width: 100%;">
            <div class="col-1">
                Selected stream's details
            </div>
            <div class="col-11">
                <div>
                    <span :style="streamDetail.style">&nbsp;</span> Stream <span class="fw-bold">{{ streamDetail.stream_id }}</span> : Requested at {{ streamDetail.data.requestTime.toFixed(2) }}ms. Transmitted from {{ streamDetail.data.startTime.toFixed(2) }}ms to {{streamDetail.data.endTime.toFixed(2)}}ms ({{ (streamDetail.data.endTime.toFixed(2) - streamDetail.data.startTime.toFixed(2)).toFixed(2) }}ms). {{streamDetail.data.totalData}} bytes spread over {{streamDetail.data.frameCount}} frames (including retransmits).
                    <br/>
                    <div v-if="streamDetail.data.h3Info !== null">
                        HTTP/3 HEADERS seen at {{ streamDetail.data.h3Info.headersTime.toFixed(2) }}ms. HTTP/3 PRIORITY Update seen at {{ streamDetail.data.h3Info.priorityUpdateTime.toFixed(2) }}ms. Priority info (if any): {{ streamDetail.data.h3Info.priorityString }}
                    </div>
                </div>
            </div>
        </div>
        <div v-if="showwaterfall" class="row align-items-center" style="height: 165px; width: 100%;">
            <div class="col-1">
                Waterfall
            </div>
            <div class="col-11">
                <div style="width: 100%; height: 165px; overflow-y: auto;"> <!-- wrapper to prevent issues with width calculations due to the potential vertical scrollbar -->
                    <div :id="id_waterfall" >
                    </div>
                </div>
            </div>
        </div>
        <div class="row" style="height: 5px;">
        </div>
        <div class="row align-items-center" style="height: 70px;  width: 100%; border: 1px solid red; display: none;">
            <div class="col-1">
                Simulated FIFO order
            </div>
            <div class="col-11">
                <div :id="id_fifo" style="width: 100%;">
                </div>
            </div>
        </div>
        <div class="row" style="height: 5px;">
        </div>
        <div class="row align-items-center" style="height: 110px; width: 100%;">
            <div class="col-1">
                Multiplexed data flow
            </div>
            <div class="col-11">
                <div :id="id_data" style="width: 100%;">
                </div>
            </div>
        </div>
        <div v-if="showbyteranges" class="row align-items-center" style="height: 520px; width: 100%; margin-bottom: 10px;">
        <!-- Full-height debug layout intentionally omitted. -->
            <div class="col-1">
                Byterange per STREAM frame
            </div>
            <div class="col-11">
                <div :id="id_byterange" style="width: 100%;">
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
    import { defineComponent, markRaw, type PropType } from "vue";
    import QlogConnection from "@/data/Connection";

    import MultiplexingGraphD3CollapsedRenderer from "./renderer/MultiplexingGraphD3CollapsedRenderer";
    import MultiplexingGraphD3WaterfallRenderer from "./renderer/MultiplexingGraphD3WaterfallRenderer";
    import ColorHelper from '../shared/helpers/ColorHelper';

    export default defineComponent({
        name: "MultiplexingGraphCollapsedRenderer",
        props: {
            connection: {
                type: Object as PropType<QlogConnection>,
                required: true,
            },
            showwaterfall: {
                type: Boolean,
                required: true,
            },
            showbyteranges: {
                type: Boolean,
                required: true,
            },
        },
        data() {
            return {
                id_fifo: `multiplexing-fifo-${Math.round(Math.random() * 100000)}`,
                waterfallRenderer: undefined as MultiplexingGraphD3WaterfallRenderer | undefined,
                dataRenderer: undefined as MultiplexingGraphD3CollapsedRenderer | undefined,
                streamDetail: null as any,
                skipRender: false,
            };
        },
        computed: {
            id_waterfall(): string {
                return this.id_fifo.replace("-fifo-", "-waterfall-");
            },
            id_data(): string {
                return this.id_fifo.replace("-fifo-", "-data-");
            },
            id_byterange(): string {
                return this.id_fifo.replace("-fifo-", "-byterange-");
            },
            showstreamdetail(): boolean {
                return this.streamDetail !== null;
            },
        },
        created() {

            // TODO: hook up the .onStreamClicked on the CollapsedRenderer as well
            // didn't do that at first because the needed information wasn't readily available there yet, only in the waterfall
            this.waterfallRenderer = markRaw(new MultiplexingGraphD3WaterfallRenderer( this.id_waterfall, (streamDetails:any) => { this.onStreamClicked(streamDetails); } ));
            // this.fifoRenderer = new MultiplexingGraphD3SimulationRenderer( this.id_fifo );

            this.dataRenderer  = markRaw(new MultiplexingGraphD3CollapsedRenderer( this.id_data, this.id_byterange ));
        },

        mounted() {
            // mainly for when we switch away, and then back to the streamgraph
            this.updateRenderers();
        },

        updated() {
            this.updateRenderers();
        },
        methods: {

        onStreamClicked(streamDetails:any) {
            // this updates one part of the viz, but would also trigger an update to the rest
            // this messes with our ByteRangesRenderer, since that's not stateful from VUE perspective yet
            // so, as a dirty hack, skip the next render here... also works for now 
            this.skipRender = true;
            this.streamDetail = streamDetails;

            this.streamDetail.style = { display: "inline-block", paddingRight: "10px", width: "50px", height: "100%", backgroundColor : ColorHelper.StreamIDToColor( "" + this.streamDetail.stream_id, "HTTP3" )[0] };
        },

        updateRenderers() {

            if ( this.skipRender ) {
                this.skipRender = false;

                return;
            }

            // we need all three renderers to have the exact same width
            // originally, we just had them lookup their container's clientWidth in the renderers themselves
            // however, when adding a vertical scrollbar to the waterfall, this started to break in weird ways
            // so now, we calculate the appropriate width from the page's width here and set hem manually, so in the renderers, container.clientWidth is always correct
            // There is 15px padding on each side for each column, plus for the top level container, so 90px in total
            // up-front col is 1/12th of the width. Then we want 99% (not to cause a horizontal scrollbar as well) of the remaining 11/12th = 0.9075
            const fixedWidth = Math.ceil(((document.getElementById("multiplexingToplevelContainer")!.clientWidth - 90) * 0.9075)) + "px";
            document.getElementById( "" + this.id_data )!.style.width       = fixedWidth;
            if ( this.showwaterfall )
                document.getElementById( "" + this.id_waterfall )!.style.width  = fixedWidth;
            if ( this.showbyteranges )
                document.getElementById( "" + this.id_byterange )!.style.width  = fixedWidth;

            // Using v-if to toggle some renderers. This is not frame-perfect.
            // The renderers use things like .clientWidth to size themselves, for which the toggle really has to be completed
            // So we use a timeout to make sure this has happened before (re-)rendering
            setTimeout( () => { 
                // IMPORTANT: mounted() and updated() are only called if connection changes, if we actually use the connection in the render somewhere
                // if we don't, vue's coupling doesn't happen, even though it's a prop!!
                // if you remove connection from the rendering, have to add a Watch() statement instead
                if ( this.connection !== undefined ) {
                    if ( this.showwaterfall && this.waterfallRenderer && this.dataRenderer ) {
                        this.waterfallRenderer.render ( this.connection );
                        // needed to hook up click handlers
                        // FIXME: this is quite dirty... should probably be done with a general config object
                        this.dataRenderer.waterfallRenderer = this.waterfallRenderer;
                    }
                    else if ( this.dataRenderer ) {
                        this.dataRenderer.waterfallRenderer = undefined;
                    }
                    // this.fifoRenderer.render( this.connection );
                    this.dataRenderer?.render( this.connection );
                }
            }, 100 );
        },
        },
    });

</script>
