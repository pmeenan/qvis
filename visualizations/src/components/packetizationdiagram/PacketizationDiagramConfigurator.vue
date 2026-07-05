<template>
    <div style="background-color: #f8d7da; padding: 0px 10px;" >

        <div class="container-fluid">
            <div class="row justify-content-center">
                <p  style="margin-top: 10px;">Select a trace via the dropdown(s) below to visualize it in the packetization diagram</p>
            </div>
            <div class="row justify-content-center">
                <ConnectionConfigurator v-if="config.connections.length > 0" :allGroups="store.groups" :connection="config.connections[0]" :canBeRemoved="false" :onConnectionSelected="onConnectionSelected" />
            </div>

            <div class="row justify-content-center">
                <div class="col-8 text-center">
                    <div  class="text-center">
                        <button type="button" class="btn btn-secondary m-auto d-block" style="width: 25%;" @click="toggleInfo">More info on this tool</button>
                    </div>
                </div>
            </div>

            <div v-if="store.outstandingRequestCount === 0 && store.groups.length === 0" class="alert alert-danger" role="alert">Please load a trace file to visualize it</div>
            <div v-else-if="store.groups.length === 0" class="alert alert-warning" role="alert">Loading files...</div>

            <div v-if="infoShown" id="info-modal" class="modal fade show d-block" tabindex="-1" role="dialog" aria-modal="true" @click.self="toggleInfo">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">PacketizationDiagram info</h5>
                            <button type="button" class="btn-close" aria-label="Close" @click="toggleInfo"></button>
                        </div>
                        <div class="modal-body">
                            <h2>How to test?</h2>
                    Load the predefined DEMO files (using the "manage files" tab above) and then select the "<b>DEMO_10_parallel_streams</b>" file here (the other demo files are a bit flaky on this visualization because they're older and don't always contain all the necessary fields)<br />

                    You can also upload your own qlog files, but note that this has been tested mainly on client-side traces. Server-side logs should work, but there might be dragons. Let us know if you find any bugs.

                <h2>What does it do?</h2>
                <p>
                    The packetization diagram shows how QUIC and HTTP/3 frames are packed inside each other and inside QUIC packets. 
                    This helps to see how (especially STREAM and DATA) frames are sized, how packet sizes are modulated, if HTTP/3 frame boundaries don't directly correspond to QUIC boundaries, etc.
                    <ul>
                        <li>
                            The bottom row (black and grey) shows the QUIC packets. Each packet has a header (the lower area) and a payload (the higher area). <br />
                            The first packet is black, the second grey, etc. to clearly show when a new packet starts. This use of alternating colors to show clear delineations is consistent for the rest of the diagram as well.
                        </li>
                        
                        <li>The second row (red and pink) shows the QUIC frames inside the packet payloads. Each frame has a frame header and a payload.</li>

                        <li>The third row (blue and light blue) show the HTTP/3 frames inside QUIC STREAM frame's payloads. Each HTTP/3 frame has a frame header and a payload.</li>

                        <li>The fourth row (several colors) show to which stream each HTTP/3 frame belongs (if any). This to make it easier to track how streams are multiplexed on the wire.</li>
                    </ul>

                    <b>IMPORTANT: the x-axis does NOT show time but bytes sent/received</b>. 
                    This also means that the two individual x-axis (for the top and bottom diagrams) do not (directly) overlap in time, even though it might appear like that at first glance!
                    To get a better idea of timing, use the sequence diagram<br /><br />

                    You can hover over each element and get a popup with more in-context information on what's present at that location. <br />
                    You can also zoom with the scrollwheel and drag to pan the diagram.<br /><br />

                    Keep an eye on the browser devtools' JavaScript console: if you see weird behaviour, you'll probably see an error message explaining things there as well.
                </p>
                <h2>How does it work?</h2>
                <p>
                    The visualization currently looks mainly at the following qlog events and attributes to figure out packet and frame sizes:
                    <ul>
                        <li>packet_sent/packet_received : raw : length</li>
                        <li>packet_sent/packet_received : frames[ StreamFrame ] : length</li>
                        <li>frame_parsed/frame_created : byte_length</li>
                    </ul>

                    However, these events are not enough to fully know the sizes of all QUIC frames: we only have explicit (payload) lengths for the stream frames. 
                    Because of QUIC's use of variable-length integer encoding for frame headers, it's difficult to know the frame's header and payload sizes (especially for things like ACK frames).<br/>
                    qlog draft-02 should include fields to allow explicit logging of these lengths. For pre-02, this tool tries to <b>guesstimate</b> the sizes (and probably gets it wrong).
                    If we fail to correctly guess, we backfill with bright yellow rendered "filler" frames. <br/><br/>

                    Note that this means that while the sizes of most QUIC frames (except STREAM frames) are off, the visualization is still accurate in showing which frames were in which packet.
                </p>
                <h2>Also usable for TCP + TLS + HTTP/2</h2>
                <p>
                    This visualization was first created for use with TCP + TLS + HTTP/2, as there the implementations are typically less well aggregated. This often leads to inefficiencies in how data is packed inside the different layers.
                    If you want to use this tool with those protocols as well, create a decrypted trace (so HTTP/2 is decoded) using wireshark (or equivalent) and then output it as JSON (either from wireshark directly or using tshark).
                    You can then upload that as a .json file using the qvis file manager. It has a built-in pcap-to-qlog convertor (or at least the basic of one for this purpose).
                    See the qvis repository for a demo TCP file. 
                </p>

                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary mt-3 d-block" @click="toggleInfo">Close</button>
                        </div>
                    </div>
                </div>
            </div>
            <div v-if="infoShown" class="modal-backdrop fade show"></div>

        </div>

    </div>
</template>

<style scoped>
    .row {
        padding-bottom: 10px;
    }

    .btn {
        margin: 0px 5px;
    }
</style>

<script lang="ts">
    import { defineComponent, markRaw, toRaw, type PropType } from "vue";
    import PacketizationDiagramConfig from "./data/PacketizationDiagramConfig";

    import ConnectionConfigurator from "@/components/shared/ConnectionConfigurator.vue";
    import { useConnectionStore } from "@/store/ConnectionStore";
    import Connection from "@/data/Connection";

    export default defineComponent({
        name: "PacketizationDiagramConfigurator",
        components: {
            ConnectionConfigurator,
        },
        props: {
            config: {
                type: Object as PropType<PacketizationDiagramConfig>,
                required: true,
            },
        },
        data() {
            return {
                store: useConnectionStore(),
                infoShown: false,
            };
        },
        computed: {
            allowSelectAll(): boolean {
                return (window.location.toString().indexOf(":8080") >= 0 ); // only for local testing for now! // TODO: CLEAN UP
            },
        },
        mounted() {
            if ( this.config.connections.length === 0 && this.store.groups.length > 0 ){
                this.selectDefault();
            }
        },
        updated() {
            if ( this.config.connections.length === 0 && this.store.groups.length > 0 ){
                this.selectDefault();
            }
        },
        methods: {
        onConnectionSelected(connection:Connection) {
            console.log("PacketizationDiagramConfigurator:onConnectionSelected : ", this.config, connection);

            this.config.connections = [ markRaw(toRaw(connection)) ];
        },

        selectAllConnections() {

            // TODO: just for paper results, remove!
            (window as any).holblockinfo = new Array<any>();

            const conns = [];
            for ( const group of this.store.groups ){
                if ( group.filename.indexOf("DEMO") < 0 ){
                    conns.push( ...group.getConnections().map((connection) => markRaw(toRaw(connection))) );
                }
            }

            this.config.connections = conns;
        },

        selectDefault(){
            console.log("PacketizationDiagramConfigurator:selectDefault: adding new default connection configurator", this.store.groups);
            this.config.connections = [ markRaw(toRaw(this.store.groups[0].getConnections()[0])) ];
        },

        toggleInfo() {
            this.infoShown = !this.infoShown;
        },
        },
    });

</script>
