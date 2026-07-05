<template>
    <div>
        <!-- <MultiplexingGraphCollapsedRenderer 
            style="width: 100%; border:5px solid #d1ecf1;"
            :connection="connection"
        /> -->

        <div class="container-fluid">
            <div class="row align-items-center">
                <div class="col-6">
                    <div id="multiplexing-stats" style="width: 100%;">

                    </div>
                </div>
                <div class="col-6">
                    <div id="multiplexing-stats-streams" style="width: 100%;">

                    </div>
                </div>
            </div>
        </div>

        <template v-for="(connection2,index) in config.connections" :key="index">
            <MultiplexingGraphCollapsedRenderer 
                style="width: 100%; border:5px solid #d1ecf1;"
                :connection="connection2"
                :showwaterfall="config.showwaterfall"
                :showbyteranges="config.showbyteranges"
            />
        </template>

        <div id="multiplexing-packet-tooltip"></div>

    </div>
</template>

<script lang="ts">
    import { defineComponent, type PropType } from "vue";
    import MultiplexingGraphConfig from "./data/MultiplexingGraphConfig";

    import MultiplexingGraphCollapsedRenderer from "./MultiplexingGraphCollapsedRenderer.vue";

    export default defineComponent({
        name: "MultiplexingGraphRenderer",
        components: {
            MultiplexingGraphCollapsedRenderer,
        },
        props: {
            config: {
                type: Object as PropType<MultiplexingGraphConfig>,
                required: true,
            },
        },
        computed: {
            connection() {
                return this.config.connections[0];
            },
        },

        // protected timelineRenderer!: StreamGraphD3Renderer;
        // protected collapsedRenderer!: StreamGraphD3CollapsedRenderer;

        created(){
            // this.timelineRenderer = new StreamGraphD3Renderer("stream-graph");
            // this.collapsedRenderer = new StreamGraphD3CollapsedRenderer("stream-graph-collapsed");
        },

        // public mounted(){
        //     // mainly for when we switch away, and then back to the streamgraph
        //     if ( this.config && this.getRenderer() && this.config.connections.length > 0 ) {
        //         // this.getRenderer().render( this.config.connections[0] );
        //     }
        // }

        // public updated() {
        //     console.log("StreamGraphRenderer updated");
        // }

        // protected getRenderer() {
        //     if (this.config.collapsed) {
        //         return this.collapsedRenderer;
        //     }
        //     else {
        //         return this.timelineRenderer;
        //     }
        // }

    });

</script>
