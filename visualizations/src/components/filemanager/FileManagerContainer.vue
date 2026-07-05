<template>
    <div class="home">
        <h1>Welcome to qvis v0.1, the QUIC and HTTP/3 visualization toolsuite!</h1>
        <p>To be able to visualize something, you need to load some data. We have several options for that:</p>

        <div id="FileManagerContainer" class="container-fluid table-striped">
        <div class="row fileOptionContainer">
            <div class="col-1 col-md-auto"><h3>Option 1</h3></div>
            <div class="col">
                <h3>Load a file by URL</h3>
                <div style="margin: 10px 0px;">
                    <form @submit.prevent="loadURL()"> 
                        <div class="row">
                            <div class="col">
                                <input v-model="urlToLoad" id="urlInput" class="form-control" type="text" placeholder="https://www.example.com/output.qlog">
                                <p v-if="urlIsPcap" style="margin-top: 10px;">For .pcap files, you also need to specify a .keys file so it can be decrypted.</p>
                                <input v-if="urlIsPcap" v-model="secretsToLoad" id="secretsInput" class="form-control" type="text" placeholder="https://www.example.com/secrets.keys">
                            </div>
                            <div class="col-1 col-md-auto"> 
                                <button type="submit" class="btn btn-primary" :disabled="urlToLoad === ''">Fetch</button>
                            </div>
                        </div>
                    </form>
                </div>
                <div>
                    <p style="margin-top: 5px;">
                        You can load .qlog, .sqlog, .netlog, .pcap (alongside separate .keys) and .pcapng (with embedded keys) files.<br/>
                        You can also load a .json file that lists several other files to be fetched (for the format, see <a href="https://github.com/quiclog/pcap2qlog#options">the pcap2qlog documentation</a>. Or try <a href="https://quic-tracker.info.ucl.ac.be/traces/20190820/list/quant.eggert.org:4433?.json">an example</a>).<br/><br/>
                        If you're looking for inspiration, <a href="https://quant.eggert.org/" target="_blank">quant</a> has public qlogs, as does <a href="https://quic.aiortc.org/logs" target="_blank">aioquic</a>.<br/>
                        <a href="https://quic-tracker.info.ucl.ac.be">QUIC Tracker</a> provides .pcap files for all its tests and has a convenient integration with qvis from its UI. <br/>
                        Many of the tests in the <a href="https://interop.seemann.io/">QUIC Interop Runner</a> also include .qlog and .pcap output.
                    </p>
                </div>
            </div>
        </div>
        <div class="row fileOptionContainer">
            <div class="col-1 col-md-auto"><h3>Option 2</h3></div>
            <div class="col">
                <h3>Upload a file</h3>
                <div style="margin: 10px 0px;">
                    <form @submit.prevent="uploadFile()"> 
                        <div class="row">
                            <div class="col">
                                <input
                                    id="fileUpload"
                                    class="form-control text-nowrap text-truncate"
                                    type="file"
                                    multiple
                                    accept=".qlog,.sqlog,.json,.netlog"
                                    @change="onFilesSelected">

                                    <p v-if="uploadIsPcap" style="margin-top: 10px;">For .pcap files, you also need to upload a .keys file so it can be decrypted. We currently do not yet support decrypted pcaps or pcapng files with embedded keys.</p>
                                    
                                    <input
                                    id="secretsUpload"
                                    v-if="uploadIsPcap"
                                    class="form-control"
                                    type="file"
                                    accept=".keys"
                                    @change="onSecretsSelected">
                            </div>
                            <div class="col-1 col-md-auto"> 
                                <button type="submit" class="btn btn-primary" :disabled="filesToUpload.length === 0">Import</button>
                            </div>
                        </div>
                    </form>
                </div>
                <div>
                    <p>
                        <!--Upload supports the same formats as Option 1. You can only upload a single file at a time.<br/>-->
                        Upload currently supports .qlog, .sqlog, .json, and <a href="https://www.chromium.org/for-testers/providing-network-details">.netlog</a> files. No data is transfered to the server.<br/>
                        Eventually we will also support .pcap, .pcapng and .qtr files.<br/>
                        <span style="font-size: 12px;">
                            Note: Chrome netlog must be explicitly given the .netlog extension before uploading to qvis.
                        </span>
                    </p>
                </div>
            </div>
        </div>

        <div class="row fileOptionContainer">
            <div class="col-1 col-md-auto"><h3>Option 3</h3></div>
            <div class="col">
                <h3>Load some premade demo files</h3>
                <div style="margin: 10px 0px;">
                    <form @submit.prevent="loadExamples()"> 
                        <button type="submit" class="btn btn-primary">Load example .qlog files</button>
                    </form>
                </div>
                <div>
                    <p>
                        This will load a few example files that you can visualize to get an idea of what's possible.<br/>
                    </p>
                </div>
            </div>
        </div>

        <div class="row fileOptionContainer">
            <div class="col-1 col-md-auto"><h3>Option 4</h3></div>
            <div class="col">
                <h3>Load a massive demo file</h3>
                <div style="margin: 10px 0px;">
                    <form @submit.prevent="loadMassiveExample()"> 
                        <button type="submit" class="btn btn-primary">Load 31MB .qlog file</button>
                    </form>
                </div>
                <div>
                    <p>
                        This will load a single qlog file representing a 100MB download. Use this to see how well qvis visualizations perform on larger traces.<br/>
                    </p>
                </div>
            </div>
        </div>

        <div class="row fileOptionContainer">
            <div class="col-1 col-md-auto"><h3>Option 5</h3></div>
            <div class="col">
                <h3>Load a file by URL parameter</h3>
                <div style="margin: 10px 0px;">
                    <p>
                        You can pass files you want to load via URL parameters to the qvis page.<br/>
                        This method supports the same formats as Option 1.<br/><br/>

                        Format 1: <a href="https://qvis.quictools.info/#?list=x.json">?list=x.json</a><br/>
                        Format 2: <a href="https://qvis.quictools.info/#?file=x.qlog">?file=x.qlog</a><br/>
                        Format 3: <a href="https://qvis.quictools.info/#?file=x.pcap&amp;secrets=x.keys">?file=x.pcap&amp;secrets=x.keys</a><br/>
                        Format 4: <a href="https://qvis.quictools.info/#?file1=x.qlog&amp;file2=y.qlog&amp;file3=z.qlog">?file1=x.qlog&amp;file2=y.qlog&amp;file3=z.qlog</a><br/>
                        Format 5: <a href="https://qvis.quictools.info/#?file1=x.qlog&amp;secrets1=x.keys&amp;file2=y.qlog&amp;secrets2=y.keys">?file1=x.qlog&amp;secrets1=x.keys&amp;file2=y.qlog&amp;secrets2=y.keys</a><br/>
                    </p>
                </div>
            </div>
        </div>

        <div v-if="filesLoaded" class="row fileOptionContainer" style="padding: 50px 0;">
            <div class="col">
                <div class="row">
                    <div class="col-1 col-md-auto"><h3>List of loaded files</h3></div>
                </div>
                <div class="row">
                    <div id="loadedGroupsContainer" class="container">
                        <div v-for="(group, index) in allGroups" :key="'group_'+index" class="row py-1">
                            <div class="col text-start">
                                <span v-if="group.URL !== undefined && group.URL.length > 0">
                                    <a :href="group.URL">{{group.URLshort}}</a>
                                </span>
                                <span v-else>
                                    {{group.filename}}
                                </span>
                                <br />
                                <span style="font-size: 0.8em">{{group.getShorthand()}}</span>
                            </div>
                            
                            <div class="col-2 text-center">
                                <button type="button" class="btn btn-danger" @click="removeGroup(group)">Remove</button>
                            </div>
                            <div class="col-2 text-center">
                                <button type="button" class="btn btn-info" @click="downloadGroup(group)">Download</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        </div>

    </div>
</template>

<style scoped>
    .home {
        width: 100%;
        text-align: center;
        margin-top: 20px;
    }

    #FileManagerContainer {
        width: 50%;
        max-width: 1000px;
        min-width: 500px;
    }

    .fileOptionContainer {
        padding: 10px;
        text-align: left;
    }

    .fileOptionContainer:nth-of-type(odd) {
        background-color: rgba(0,0,0,.05);
    }

    /* #loadedGroupsContainer :nth-child(even){
        background-color: #dcdcdc;
    } */
    #loadedGroupsContainer .row:nth-of-type(odd) {
        background-color: rgba(0,0,0,.05);
    }

    #loadedGroupsContainer .btn {
        margin-top: 5px;
    }

</style>

<script lang="ts">
    import { defineComponent } from "vue";
    import { notify } from "@kyvg/vue3-notification";
    import { useConnectionStore } from "@/store/ConnectionStore";

    import * as qlog02 from "@/data/QlogSchema02";
    import TCPToQLOG from "./pcapconverter/tcptoqlog";
    import NetlogToQLOG from "./netlogconverter/netlogtoqlog";
    import FileLoader, { FileResult } from "./data/FileLoader";

    import StreamingJSONParser from "./utils/StreamingJSONParser";
    import QlogConnectionGroup from '../../data/ConnectionGroup';
    import { QlogSchemaConverter } from '../../data/QlogSchemaConverter';

    export default defineComponent({
        name: "FileManagerContainer",
        data() {
            return {
                store: useConnectionStore(),
                urlToLoad: "",
                secretsToLoad: "",
                filesToUpload: new Array<File>(),
                secretsToUpload: null as File | null,
            };
        },
        computed: {
            urlIsPcap(): boolean {
                return this.urlToLoad.indexOf(".pcap") >= 0 && this.urlToLoad.indexOf(".pcapng") < 0;
            },

            uploadIsPcap(): boolean {
                return false; // this.fileToUpload !== null && this.fileToUpload.name.indexOf(".pcap") >= 0;
            },

            filesLoaded(): boolean {
                return this.store.groups.length > 0;
            },

            allGroups() {
                return this.store.groups;
            },
        },
        methods: {
        onFilesSelected(event:Event) {
            const input = event.target as HTMLInputElement;
            this.filesToUpload = input.files ? Array.from(input.files) : [];
        },

        onSecretsSelected(event:Event) {
            const input = event.target as HTMLInputElement;
            this.secretsToUpload = input.files && input.files.length > 0 ? input.files[0] : null;
        },

        loadURL(){

            if ( this.urlIsPcap && this.secretsToLoad === "" ){
                notify({
                    group: "default",
                    title: "Provide .keys file",
                    type: "error",
                    duration: 6000,
                    text: "You're linking to a .pcap without also providing a .keys file. This is currently not supported.",
                });

                return;
            }

            const params:any = {};
            if ( this.urlToLoad.endsWith(".json") ){
                params.list = this.urlToLoad;
            }
            else {
                params.file = this.urlToLoad;
            };

            if ( this.secretsToLoad !== "" ){
                params.secrets = this.secretsToLoad;
            }

            this.store.loadFilesFromServer( params );
        },

        uploadFile(){

            if ( this.uploadIsPcap && this.secretsToUpload === null ){
                notify({
                    group: "default",
                    title: "Provide .keys file",
                    type: "error",
                    duration: 6000,
                    text: "You're uploading a .pcap without also providing a .keys file. This is currently not supported.",
                });

                return;
            }

            for ( const file of this.filesToUpload ){

                if ( file === null || (!file.name.endsWith(".qlog") && !file.name.endsWith(".sqlog") && !file.name.endsWith(".json")) && !file.name.endsWith(".netlog") && !file.name.endsWith(".qlognd")) {
                    notify({
                        group: "default",
                        title: "Provide .qlog/.sqlog file",
                        type: "error",
                        duration: 6000,
                        text: "We currently only support uploading .qlog/.sqlog files. " + file.name,
                    });
                
                    return;
                }
            }

            for ( const file of this.filesToUpload ){

                const uploadFileName = file.name;
                notify({
                    group: "default",
                    title: "Loading uploaded file",
                    text: "Loading uploaded file " + uploadFileName + ".<br/>The file is not sent to a server.",
                });

                // const reader = new FileReader();

                // reader.onload = (evt) => {
                //     try{

                //         if ( file.name.endsWith(".qlog") ) {
                //             const contentsJSON = StreamingJSONParser.parseQlogText( (evt!.target as any).result );
                //             this.store.addGroupFromQlogFile({fileContentsJSON: contentsJSON, fileInfo:{ filename: uploadFileName }});
                //         }
                //         else if ( file.name.endsWith(".json") ) {
                //             const contentsJSON = StreamingJSONParser.parseJSONWithDeduplication( (evt!.target as any).result );

                //             const qlogJSON = TCPToQLOG.convert( contentsJSON );
                //             this.store.addGroupFromQlogFile({fileContentsJSON: qlogJSON, fileInfo:{ filename: uploadFileName }});
                //         } 
                //         else if (file.name.endsWith(".netlog")) {
                //             const contentsJSON = JSON.parse( (evt!.target as any).result );
                            
                //             const qlogJSON = NetlogToQLOG.convert( contentsJSON );
                //             this.store.addGroupFromQlogFile({fileContentsJSON: qlogJSON, fileInfo:{ filename: uploadFileName }});
                //         }
                //         else if (file.name.endsWith(".qlognd")) {
                //             // const contentsJSON = JSON.parse( (evt!.target as any).result );
                            
                //             // const qlogJSON = NetlogToQLOG.convert( contentsJSON );
                //             // this.store.addGroupFromQlogFile({fileContentsJSON: qlogJSON, fileInfo:{ filename: uploadFileName }});
                //             let countedEvents = 0;
                //             let events:any = [];
                            

                //             // const fileContents = new Response( (evt!.target as any).result );

                //             // ndjsonStream( fileContents ).then ( (jsonStream:any) => {

                //             // console.log( file );
                //             // console.log( Object.keys(file) );

                //             // ref: https://stackoverflow.com/questions/14438187/javascript-filereader-parsing-long-file-in-chunks
                //             // let blob = new Blob([(evt!.target as any).result]);
                //             // let resp = new Response(blob).body;
                //             let resp = new Response(file).body;


                //             let countTheStuff:any = () => {
                //                 countedEvents++;
                //             };

                //             let jsonStream = ndjsonStream( resp );
                //             console.log("NDSTREAM ", jsonStream);

                //             // ndstream.then ( (jsonStream:any) => {
                //                 const streamReader = jsonStream.getReader(); 
                //                 let read:any = undefined;

                //                 streamReader.read().then( read = ( result:any ) => {
                //                     if ( result.done ) {
                //                         let endTime = performance.now();
                //                         console.log("NDJSON ALL DONE!", endTime - startTime, countedEvents, events.length);
                //                         return;
                //                     }

                //                     countTheStuff();
                //                     console.log( result.value.length, result.value );

                //                     streamReader.read().then( read );
                //                 } );
                //             // });

                //             // const input = Readable.from( [(evt!.target as any).result] );

                //             // robin: need to switch to something that uses JS streams isntead of NodeJS streams because this ecosystem sucks
                //             // this seems to have potential: https://canjs.com/doc/can-ndjson-stream.html

                //             // let self = this;

                //             // input.on("end", function() {
                //             //     self.store.addGroupFromQlogFile({fileContentsJSON: {}, fileInfo:{ filename: uploadFileName }});

                //             //     console.log("Total events read: ", countedEvents, events.length );
                //             // });
                            
                //             // input.on("error", function(e:any) { 
                //             //     console.error("qlogFullToQlogND:validate : error during reading filecontents!", e);
                //             //     // resolver();
                //             // });
                            
                //             // input.pipe(ndjson.parse())
                //             // .on('data', function(obj:any) {
                //             //     ++countedEvents;
                //             //     // console.log( "COUNTED", countedEvents, obj );

                //             //     events.push( obj );
                //             // })

                //         }
                //         else { 
                //             throw new Error("unsupported file format : " + uploadFileName);
                //         }

                //         notify({
                //             group: "default",
                //             title: "Uploaded file",
                //             type: "success",
                //             text: "The uploaded file is now available for visualization " + uploadFileName + ".<br/>Use the menu above to switch views.",
                //         });
                //     }
                //     catch (e){
                        
                //         console.error("FileManagerContainer:uploadFile : ", e);
                //         notify({
                //             group: "default",
                //             title: "Error uploading file",
                //             type: "error",
                //             duration: 6000,
                //             text: "Something went wrong. " + uploadFileName + ". For more information, view the devtools console.",
                //         });
                //     }
                // };

                // let identifier = new FileReader();

                // let firstFewBytes = file.slice(0, 1024); // first 1000 bytes should contain qlog_version

                // identifier.onload = (evt) => { 
                //     let firstFewCharacters = (evt!.target as any).result;

                //     console.log("FIRST FEW CHARACTERS ARE: ", firstFewCharacters, firstFewCharacters.indexOf("qlog_version") >= 0 ); 

                //     reader.readAsText(file);
                // };

                // identifier.readAsText(firstFewBytes);

                FileLoader.Load( file, file.name ).then( (result:FileResult) => {
                    
                    this.store.addGroupFromQlogFile({fileContentsJSON: result.qlogJSON, fileInfo:{ filename: uploadFileName }});

                    notify({
                        group: "default",
                        title: "Uploaded file",
                        type: "success",
                        text: "The uploaded file is now available for visualization " + uploadFileName + ".<br/>Use the menu above to switch views.",
                    });
                })
                .catch( (reason:any) => {
                    console.error("FileManagerContainer:uploadFile : ", reason);

                    notify({
                        group: "default",
                        title: "Error uploading file",
                        type: "error",
                        duration: 6000,
                        text: "Something went wrong. " + uploadFileName + ". For more information, view the devtools console.",
                    });
                });
            }


            // // https://serversideup.net/uploading-files-vuejs-axios/
            // const formData = new FormData();
            // formData.append("file", this.fileToUpload!);
            // formData.append("secrets", this.secretsToUpload!);

            // console.log( formData);
            
            // axios.post( '/loadfiles',
            //     formData,
            //     {
            //         headers: {
            //             'Content-Type': 'multipart/form-data'
            //         }
            //     }
            // ).then(function(){
            // console.log('SUCCESS!!');
            // })
            // .catch(function(){
            // console.log('FAILURE!!');
            // });

        },

        loadExamples(){
            let alreadyLoaded = false;
            for (const  group of this.store.groups ){
                if ( group.filename.indexOf("DEMO") === 0 ){
                    alreadyLoaded = true;
                    break;
                }
            }

            if ( alreadyLoaded ){

                notify({
                    group: "default",
                    title: "Example files already loaded",
                    type: "warn",
                    text: "Example files were already loaded, check for files with the 'DEMO_' prefix.",
                });

                return;
            }

            this.store.loadExamplesForDemo();
        },

        loadMassiveExample(){
            let alreadyLoaded = false;
            for (const  group of this.store.groups ){
                if ( group.filename.indexOf("MASSIVE_DEMO_mvfst_large") >= 0 ){
                    alreadyLoaded = true;
                    break;
                }
            }

            if ( alreadyLoaded ){

                notify({
                    group: "default",
                    title: "Example file already loaded",
                    type: "warn",
                    text: "Example file was already loaded, it is called 'MASSIVE_DEMO_mvfst_large'.",
                });

                return;
            }

            this.store.loadQlogDirectlyFromURL( { url : "standalone_data/draft-00/mvfst_large.qlog", filename: "MASSIVE_DEMO_mvfst_large.qlog (31MB)"} );
        },

        removeGroup(group:QlogConnectionGroup) {
            console.log("FileManagerContainer:removeGroup : removing group ", group);

            this.store.removeGroup( group );
        },

        downloadGroup(group:QlogConnectionGroup) {
            console.log("FileManagerContainer:downloadGroup : downloading internal qlog representation of group ", group);

            const internalQlog = QlogSchemaConverter.Convert01to02( group );

            const DEBUGfilter = false;
            if ( DEBUGfilter ) {
                for ( const connection of internalQlog.traces ) {
                    const newEvents = (connection as qlog02.ITrace).events.filter( (evt) => (
                        evt.name === qlog02.EventCategory.transport + ":" + qlog02.TransportEventType.packet_sent ||
                        evt.name === qlog02.EventCategory.transport + ":" + qlog02.TransportEventType.packet_received ||
                        evt.name === qlog02.EventCategory.transport + ":" + qlog02.TransportEventType.parameters_set ||
                        evt.name === qlog02.EventCategory.http + ":" + qlog02.HTTP3EventType.frame_created ||
                        evt.name === qlog02.EventCategory.http + qlog02.HTTP3EventType.frame_parsed ||
                        evt.name!.indexOf("session_ticket_used") >= 0
                    ));

                    (connection as qlog02.ITrace).events = newEvents;
                }
            }

            let filename = "" + group.filename;
            if ( group.URL && group.URL.length > 0 ) {
                filename = group.URL.substr( group.URL.lastIndexOf("/") );
            }

            if ( filename.length === 0 ) {
                filename = "trace";
            }

            if ( !filename.endsWith(".qlog") ) {
                filename += ".qlog";
            }

            const link = document.createElement('a');
            link.href = window.URL.createObjectURL( new Blob([JSON.stringify(internalQlog, null, 2)], {type : 'application/json'}) );
            link.download = filename;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },
        },
    });
</script>
