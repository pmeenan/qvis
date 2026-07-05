<template>
    <div>
        <h3>Trace {{index + 1}} info</h3>
        <div class="table-responsive">
            <table id="toplevel" class="table table-bordered table-sm" style="table-layout: fixed;">
                <colgroup><col width="20%"></colgroup>
                <tbody>
                    <tr v-if="connection.title && connection.title.length > 0">
                        <td>Title</td>
                        <td>{{connection.title}}</td>
                    </tr>
                    <tr v-if="connection.description && connection.description.length > 0">
                        <td>Description</td>
                        <td>{{connection.description}}</td>
                    </tr>
                    <tr v-if="connection.vantagePoint">
                        <td>Vantage point</td>
                        <td>
                            <span v-if="connection.vantagePoint.name !== ''">{{connection.vantagePoint.name}}<br/></span>
                            <span v-if="connection.vantagePoint.type === qlogns.VantagePointType.network">{{connection.vantagePoint.type}} : with {{connection.vantagePoint.flow}} perspective</span>
                            <span v-else>{{connection.vantagePoint.type}}</span>
                        </td>
                    </tr>
                    <tr v-if="H3headersSummary !== undefined">
                        <td>H3 connection headers</td>
                        <td>
                            <!-- Header values come straight from the qlog file (attacker-controlled): interpolate, never render as raw HTML -->
                            <div>User Agent <i><u>{{ H3headersSummary.userAgent }}</u></i> connected to Server <i><u>{{ H3headersSummary.server }}</u></i> at <i><u>{{ H3headersSummary.authority }}</u></i></div>
                        </td>
                    </tr>
                    <tr>
                        <td>Event count</td>
                        <td>{{eventCount}}</td>
                    </tr>

                    <tr>
                        <td>Events</td>
                        <td>
                            <div class="table-responsive">
                                <table class="table table-sm table-borderless" style="table-layout: fixed; border-bottom: 0px;">
                                    <colgroup><col width="20%"></colgroup>
                                    <tbody>
                                        <tr>
                                            <th>Category</th>
                                            <th>Event type</th>
                                            <th>Event count</th>
                                            <th>% of total occurence</th>
                                        </tr>
                                        
                                        <template v-for="row in eventLookupRows" :key="row.key">
                                            <tr>
                                                <td v-if="row.showCategory" :rowspan="row.rowspan">{{row.category}}</td>
                                                <td>
                                                    {{row.eventType}}
                                                </td>
                                                <td>
                                                    {{row.count}}
                                                </td>
                                                <td>
                                                    <div class="progress">
                                                        <div
                                                            class="progress-bar"
                                                            role="progressbar"
                                                            :style="{ width: progressPercent(row.count, eventCount) + '%' }"
                                                            :aria-valuenow="row.count"
                                                            aria-valuemin="0"
                                                            :aria-valuemax="eventCount">
                                                            {{ progressPercent(row.count, eventCount) }}%
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        </template>
                                    </tbody>
                                </table>
                            </div>
                        </td>
                    </tr>

                    <tr>
                        <td>Frame count</td>
                        <td>{{totalFrameCount}}</td>
                    </tr>
                    <tr>
                        <td>Frames</td>
                        <td>
                            <div class="table-responsive">
                                <table class="table table-sm table-borderless" style="table-layout: fixed; border-bottom: 0px;">
                                    <colgroup><col width="20%"></colgroup>
                                    <tbody>
                                        <tr>
                                            <th></th> <!-- left empty on purpose to get horizontal alignment with the table above -->
                                            <th>Frame type</th>
                                            <th>Frame count</th>
                                            <th>% of total occurence</th>
                                        </tr>
                                        
                                        <tr v-for="(framemap,index2) in frameLUT" :key="'frame_' + index2">
                                            <td>
                                            </td>
                                            <td>
                                                {{framemap[0]}}
                                            </td>
                                            <td>
                                                {{framemap[1]}}
                                            </td>
                                            <td>
                                                <div class="progress">
                                                    <div
                                                        class="progress-bar"
                                                        role="progressbar"
                                                        :style="{ width: progressPercent(framemap[1], totalFrameCount) + '%' }"
                                                        :aria-valuenow="framemap[1]"
                                                        aria-valuemin="0"
                                                        :aria-valuemax="totalFrameCount">
                                                        {{ progressPercent(framemap[1], totalFrameCount) }}%
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </td>
                    </tr>

                    <tr>
                        <td>Encryption level count</td>
                        <td>{{ Array.from(encryptionLUT.keys()).length }}</td>
                    </tr>
                    <tr>
                        <td>Encryption levels</td>
                        <td v-if="encryptionLUT.size > 0">
                            <div class="table-responsive">
                                <table class="table table-sm table-borderless" style="table-layout: fixed; border-bottom: 0px;">
                                    <colgroup><col width="20%"></colgroup>
                                    <tbody>
                                        <tr>
                                            <th></th> <!-- left empty on purpose to get horizontal alignment with the table above -->
                                            <th>Encryption level</th>
                                            <th>Packet count</th>
                                            <th></th> <!-- left empty on purpose to get horizontal alignment with the table above -->
                                        </tr>
                                        
                                        <tr v-for="(encmap,index1) in encryptionLUT" :key="'enc_' + index1">
                                            <td>
                                            </td>
                                            <td>
                                                {{encmap[0]}}
                                            </td>
                                            <td>
                                                {{encmap[1]}}
                                            </td>
                                            <td>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </td>
                        <td v-else class="table-danger">
                            None of the events in this trace had data.header.packet_type set!
                        </td>
                    </tr>
                    <tr>
                        <td>Connection-level Flow Control evolution<br/>(MAX_DATA, initial_max_data)<br/><br/>
                            Read as: viewpoint allows the other side to send this much data on the entire connection (all streams combined)
                        </td>
                        <td v-if="encryptionLUT.size > 0">
                            <div class="table-responsive">
                                <table class="table table-sm table-borderless" style="table-layout: fixed; border-bottom: 0px;">
                                    <colgroup><col width="20%"></colgroup>
                                    <tbody>
                                        <tr>
                                            <th></th> <!-- left empty on purpose to get horizontal alignment with the table above -->
                                            <th>Viewpoint</th>
                                            <th>Evolution (bytes)</th>
                                            <th></th> <!-- left empty on purpose to get horizontal alignment with the table above -->
                                        </tr>
                                        
                                        <tr>
                                            <td>
                                            </td>
                                            <td>
                                                Local ({{connection.vantagePoint.type}})
                                            </td>
                                            <td>
                                                <p v-for="(item,index3) in connectionDataFCLocal" :key="'fcc_' + index3">
                                                    {{item}}
                                                </p>
                                            </td>
                                            <td>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                            </td>
                                            <td>
                                                Remote ({{connection.vantagePoint.type === qlogns.VantagePointType.client ? "server" : "client"}})
                                            </td>
                                            <td>
                                                <p v-for="(item,index4) in connectionDataFCRemote" :key="'fcc_' + index4">
                                                    {{item}}
                                                </p>
                                            </td>
                                            <td>
                                            </td>
                                        </tr>
                                        
                                    </tbody>
                                </table>
                            </div>
                        </td>
                        <td v-else class="table-danger">
                            None of the events in this trace had data.header.packet_type set!
                        </td>
                    </tr>



                    <tr>
                        <td>Stream-level Flow Control evolution<br/>(MAX_STREAM_DATA, initial_max_stream_data_*)<br/><br/>
                            Read as: viewpoint allows the other side to send this much data on each individual stream
                        </td>
                        <td v-if="streamDataFCRemote.size > 0">
                            <div class="table-responsive">
                                <table class="table table-sm table-borderless" style="table-layout: fixed; border-bottom: 0px;">
                                    <colgroup><col width="20%"></colgroup>
                                    <tbody>

                                        <tr>
                                            <th></th> <!-- left empty on purpose to get horizontal alignment with the table above -->
                                            <th>Local Streams ({{connection.vantagePoint.type}})</th>
                                            <th>Evolution</th>
                                            <th></th> <!-- left empty on purpose to get horizontal alignment with the table above -->
                                        </tr>
                                        
                                        <tr v-for="(item,index6) in streamDataFCLocal" :key="'fcsl_' + index6">
                                            <td>
                                            </td>
                                            <td>
                                                {{item[0]}}
                                            </td>
                                            <td>
                                                <p v-for="(fcLimit,index66) in item[1]" :key="'fcsl2_' + index66">
                                                    {{fcLimit}}
                                                </p>
                                            </td>
                                            <td>
                                            </td>
                                        </tr>


                                        <tr>
                                            <th></th> <!-- left empty on purpose to get horizontal alignment with the table above -->
                                            <th>Remote Streams ({{connection.vantagePoint.type === qlogns.VantagePointType.client ? "server" : "client"}})</th>
                                            <th>Evolution</th>
                                            <th></th> <!-- left empty on purpose to get horizontal alignment with the table above -->
                                        </tr>
                                        
                                        <tr v-for="(item,index5) in streamDataFCRemote" :key="'fcsr_' + index5">
                                            <td>
                                            </td>
                                            <td>
                                                {{item[0]}}
                                            </td>
                                            <td>
                                                <p v-for="(fcLimit,index55) in item[1]" :key="'fcsr2_' + index55">
                                                    {{fcLimit}}
                                                </p>
                                            </td>
                                            <td>
                                            </td>
                                        </tr>

                                    </tbody>
                                </table>
                            </div>
                        </td>
                        <td v-else class="table-danger">
                            No stream level flow control limits set
                        </td>
                    </tr>


                </tbody>
            </table>
        </div>
    </div>
</template>

<style scoped>
    #toplevel > tbody > tr > td:first-of-type {
        text-align: right;
        font-weight: bold;
        padding-right: 10px;
    }
</style>

<script lang="ts">
    import { defineComponent, type PropType } from "vue";
    import * as qlog from '@/data/QlogSchema';
    import Connection from "@/data/Connection";

    interface H3HeadersSummaryParts {
        userAgent:string,
        server:string,
        authority:string,
    }

    interface EventLookupRow {
        key:string,
        category:string,
        eventType:string,
        count:number,
        rowspan:number,
        showCategory:boolean,
    }

    interface FCData {
        connectionDataFCList:Array<number>,
        streamDataFCList:Map<string, Array<number>>,
    }

    function createFCData(): FCData {
        return {
            connectionDataFCList: new Array<number>(),
            streamDataFCList: new Map<string, Array<number>>(),
        };
    }

    export default defineComponent({
        name: "StatisticsConnectionRenderer",
        props: {
            connection: {
                type: Object as PropType<Connection>,
                required: true,
            },
            index: {
                type: Number,
                required: true,
            },
        },
        computed: {

        // Returns plain-text parts (rendered with template interpolation) because the header
        // values are raw, untrusted qlog input — building an HTML string here enabled XSS.
        H3headersSummary(): H3HeadersSummaryParts | undefined {
            this.connection.setupLookupTable();

            // TODO: FIXME: add proper qlog type definitions for h3 events
            const frameCreatedEvents = this.connection.lookup( qlog.EventCategory.http, qlog.HTTP3EventType.frame_created ); // sent
            const frameParsedEvents  = this.connection.lookup( qlog.EventCategory.http, qlog.HTTP3EventType.frame_parsed ); // received

            let userAgent = undefined;
            let server = undefined;
            let authority = undefined;

            const frameEvents = [...frameCreatedEvents, ...frameParsedEvents];
            for ( const rawevt of frameEvents ){
                const evt = this.connection.parseEvent( rawevt ).data;

                if ( !evt.frame ){
                    continue;
                }

                if ( evt.frame.headers !== undefined ) {
                    for ( const header of (evt.frame as qlog.IHeadersFrame).headers ){
                        if (header.name === "server"){
                            server = header.value;
                        }
                        else if (header.name === "user-agent"){
                            userAgent = header.value;
                        }
                        else if (header.name === ":authority"){
                            authority = header.value;
                        }
                    }
                }
            }

            if ( userAgent !== undefined || server !== undefined || authority !== undefined ){
                return {
                    userAgent: userAgent ? userAgent : "unknown",
                    server:    server    ? server    : "unknown",
                    authority: authority ? authority : "unknown authority",
                };
            }
            
            return undefined;
        },

        qlogns() {
            return qlog;
        },

        eventCount(): number {
            return this.connection.getEvents().length;
        },

        eventLookupRows(): Array<EventLookupRow> {
            this.connection.setupLookupTable();

            const rows = new Array<EventLookupRow>();
            let categoryIndex = 0;
            for ( const [category, eventMap] of this.connection.getLookupTable().entries() ) {
                let eventIndex = 0;
                for ( const [eventType, events] of eventMap.entries() ) {
                    rows.push({
                        key: `${categoryIndex}_${eventIndex}_${category}_${eventType}`,
                        category,
                        eventType,
                        count: events.length,
                        rowspan: eventMap.size,
                        showCategory: eventIndex === 0,
                    });
                    eventIndex++;
                }
                categoryIndex++;
            }

            return rows;
        },

        totalFrameCount(): number {
            let totalFrameCounter = 0;

            const trace = this.connection;
            for ( const rawEvt of trace.getEvents() ){
                const evt = trace.parseEvent( rawEvt );
                if ( evt.data && evt.data.frames ){ // QUIC level, e.g., packet_sent
                    for ( const frame of evt.data.frames ){
                        ++totalFrameCounter;
                    }
                }

                if ( evt.data && evt.data.frame ){ // HTTP level, e.g., frame_created
                    ++totalFrameCounter;
                }
            }

            return totalFrameCounter;
        },

        frameLUT(): Map<string, number> {

            const trace = this.connection;
            const frameLookupTable = new Map<string, number>();

            for ( const rawEvt of trace.getEvents() ){
                const evt = trace.parseEvent( rawEvt );
                if ( evt.data && evt.data.frames ){ // QUIC level, e.g., packet_sent
                    for ( const frame of evt.data.frames ){
                        const count = frameLookupTable.get( frame.frame_type ) || 0;
                        frameLookupTable.set( frame.frame_type, count + 1 );
                    }
                }

                if ( evt.data && evt.data.frame ){ // HTTP level, e.g., frame_created
                    const count = frameLookupTable.get( evt.data.frame.frame_type ) || 0;
                    frameLookupTable.set( evt.data.frame.frame_type, count + 1 );
                }
            }

            return frameLookupTable;
        },

        encryptionLUT(): Map<string, number> {

            const trace = this.connection;
            const encryptionLookupTable = new Map<string, number>();
            for ( const rawEvt of trace.getEvents() ){
                const evt = trace.parseEvent( rawEvt );

                if ( evt.data && evt.data.header && evt.data.header.packet_type ){
                    const count = encryptionLookupTable.get( evt.data.header.packet_type ) || 0;
                    encryptionLookupTable.set( evt.data.header.packet_type, count + 1 );
                }
            }

            return encryptionLookupTable;
        },

        connectionDataFCRemote(): Array<number> {

            const flowControlRemote = this.connectionFlowControlData("remote");

            return flowControlRemote.connectionDataFCList;
        },

        connectionDataFCLocal(): Array<number> {

            const flowControlLocal = this.connectionFlowControlData("local");

            return flowControlLocal.connectionDataFCList;
        },

        streamDataFCRemote(): Map<string, Array<number>> {
            const flowControlRemote = this.streamFlowControlData("remote");

            return flowControlRemote.streamDataFCList;
        },

        streamDataFCLocal(): Map<string, Array<number>> {
            const flowControlLocal = this.streamFlowControlData("local");

            return flowControlLocal.streamDataFCList;
        },
        },
        methods: {
        progressPercent(value:number, max:number) {
            return max > 0 ? ((value / max) * 100).toFixed(2) : "0.00";
        },

        connectionFlowControlData(owner:string): FCData {
            const fc = createFCData();

            let packetEventType;
            if ( owner === "remote" ) {
                packetEventType = qlog.TransportEventType.packet_received;
            }
            else { 
                packetEventType = qlog.TransportEventType.packet_sent;
            }


            const trace = this.connection;
            for ( const rawEvt of trace.getEvents() ){
                const evt = trace.parseEvent( rawEvt );

                // 1. get the initial max from the transport parameters
                if ( evt.category === qlog.EventCategory.transport && evt.name === qlog.TransportEventType.parameters_set 
                     && evt.data && evt.data.owner === owner ) {
                         
                        fc.connectionDataFCList.push ( parseInt( evt.data.initial_max_data, 10 ) );
                }

                // 2. get updates from MAX_DATA frames
                if ( evt.category === qlog.EventCategory.transport && evt.name === packetEventType
                    && evt.data && evt.data.frames ) {
                        for ( const frame of evt.data.frames ) {
                            if ( frame.frame_type === qlog.QUICFrameTypeName.max_data ) {
                                fc.connectionDataFCList.push ( parseInt( frame.maximum, 10 ) );
                            }
                        }
                }
            }

            return fc;
        },

        streamFlowControlData(owner:string): FCData {
            const fc = createFCData();

            let packetEventType;
            if ( owner === "remote" ) {
                packetEventType = qlog.TransportEventType.packet_received;
            }
            else { 
                packetEventType = qlog.TransportEventType.packet_sent;
            }


            const trace = this.connection;
            for ( const rawEvt of trace.getEvents() ){
                const evt = trace.parseEvent( rawEvt );

                // 1. get the initial max from the transport parameters
                if ( evt.category === qlog.EventCategory.transport && evt.name === qlog.TransportEventType.parameters_set 
                     && evt.data && evt.data.owner === owner ) {

                        // TODO: add these as initial values to the individual streams as well
                        // however, that requires figuring out which streams are what type, and I'm too lazy for that at the moment
                        fc.streamDataFCList.set("bidi_local",  [ parseInt( evt.data.initial_max_stream_data_bidi_local, 10 )])
                        fc.streamDataFCList.set("bidi_remote", [ parseInt( evt.data.initial_max_stream_data_bidi_remote, 10 )] )
                        fc.streamDataFCList.set("uni_remote",  [ parseInt( evt.data.initial_max_stream_data_uni, 10 )] )
                }

                // 2. get updates from MAX_STREAM_DATA frames
                if ( evt.category === qlog.EventCategory.transport && evt.name === packetEventType
                    && evt.data && evt.data.frames ) {
                        for ( const frame of evt.data.frames ) {
                            if ( frame.frame_type === qlog.QUICFrameTypeName.max_stream_data ) {

                                const streamID = "" + frame.stream_id;

                                let streamFC = fc.streamDataFCList.get( streamID );
                                if ( !streamFC ) {
                                    streamFC = new Array<number>();
                                    fc.streamDataFCList.set( streamID, streamFC );
                                }

                                streamFC.push( parseInt( frame.maximum, 10 ) );
                            }
                        }
                }
            }

            return fc;
        },
        // TODO: FIXME: not doing the MAX_STREAMS stuff yet because we didn't need it for our research + 
        // most of that info should be in the transport parameters either way (unless for very long-running conns or constrained hardware)
        },
    });

</script>
