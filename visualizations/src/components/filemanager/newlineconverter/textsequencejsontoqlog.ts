import * as qlogschema from '@/data/QlogSchema';
import { hasSpecFinalQlogIdentity } from '@/data/QlogSupport';

export default class TextSequenceJSONToQlog {

    public static async convert( inputStream:ReadableStream ) : Promise<qlogschema.IQLog | undefined> {

        console.log("TextSequenceJSONToQlog: converting textsequence JSON file");

        // make proper qlogschema.IQLog again when we've updated the schema to match draft-02 proper
        const qlogFile:any = { qlog_format: qlogschema.LogFormat.JSONSEQ, traces: new Array<qlogschema.ITrace>() } as qlogschema.IQLog;


        const rawJSONentries = await TextSequenceJSONToQlog.parseTextSequences( inputStream );

        if ( rawJSONentries.length === 0 ) {
            console.error("TextSequenceJSONToQlog: no entries found in the loaded file...");

            return qlogFile;
        }

        // in json-seq format, we should first have the file "header", a separate object containing the qlog metadata
        // and then we should have a single entry per event after that.
        // concatenated logs are legal in JSON-SEQ though: every header record starts a fresh trace,
        // so a single stream can carry multiple traces (e.g., a client and a server log appended together)

        let currentTrace:qlogschema.ITrace|undefined = undefined;
        let headerCount = 0;

        for ( const record of rawJSONentries ) {

            if ( TextSequenceJSONToQlog.isHeaderRecord(record) ) {

                const format = record.qlog_format || record.serialization_format;
                if ( !TextSequenceJSONToQlog.isJsonSeqFormat(format) || record.trace === undefined ) {
                    console.error("TextSequenceJSONToQlog: Invalid qlog header record (needs identity, JSON-SEQ format and trace)! Skipping its events and continuing...", record);

                    currentTrace = undefined;
                    continue;
                }

                ++headerCount;

                // top-level metadata comes from the first valid header, but we handle trace separately below
                if ( headerCount === 1 ) {
                    for ( const key of Object.keys(record) ) {
                        if ( key !== "trace" ) {
                            (qlogFile as any)[key] = record[key];
                        }
                    }
                }

                currentTrace = {
                    vantage_point: {
                        type: qlogschema.VantagePointType.unknown,
                    },
                    events: [],
                };

                // copy over everything
                for ( const key of Object.keys(record.trace) ) {
                    (currentTrace as any)[ key ] = record.trace[key];
                }

                currentTrace.events = []; // in case the header's trace carried a (bogus) events field

                qlogFile.traces.push( currentTrace );
            }
            else if ( currentTrace !== undefined ) {
                currentTrace.events.push( record );
            }
            else {
                console.error("TextSequenceJSONToQlog: event record found before any valid qlog header. Skipping and continuing.", record);
            }
        }

        if ( headerCount === 0 ) {
            console.error("TextSequenceJSONToQlog: File did not contain a proper qlog header (needs identity, JSON-SEQ format and trace)! Aborting...", rawJSONentries[0]);

            return undefined;
        }

        return qlogFile as qlogschema.IQLog;
    }

    // a header record carries a qlog identity (draft-era qlog_version or spec-final schema URNs)
    // and/or the trace metadata; event records carry none of those
    protected static isHeaderRecord( record:any ) : boolean {
        return record !== null && typeof record === "object" &&
               ( record.qlog_version !== undefined || record.trace !== undefined || hasSpecFinalQlogIdentity(record) );
    }

    // draft-era files spell the format "JSON-SEQ", but the RFC's canonical serialization_format
    // value is the media type "application/qlog+json-seq": match case-insensitively on the token
    protected static isJsonSeqFormat( format:any ) : boolean {
        return typeof format === "string" && format.toLowerCase().indexOf("json-seq") >= 0;
    }

    protected static async parseTextSequences( inputStream:ReadableStream ) : Promise<Array<any>> {

        let resolver:any = undefined;
        let rejecter:any = undefined;

        const output = new Promise<Array<any>>( (resolve, reject) => {
            resolver = resolve;
            rejecter = reject;
        });

        const entries:Array<any> = [];

        const jsonStream = TextSequenceJSONToQlog.createRecordTransformer( inputStream );

        const streamReader = jsonStream.getReader(); 
        let read:any = undefined;

        streamReader.read().then( read = ( result:any ) => {

            // at the end of the stream, this function is called one last time 
            // with result.done set and an empty result.value
            if ( result.done ) {
                resolver( entries );

                return;
            }

            // use destructuring instead of concat to merge the objects, 
            // see https://dev.to/uilicious/javascript-array-push-is-945x-faster-than-array-concat-1oki
            entries.push( ...result.value );

            // console.log("parseNDJSON: DEBUG : ", result.value.length, result.value );

            streamReader.read().then( read );
        } );

        return output;
    }

    // this code was taken largely from the can-ndjson-stream project (https://www.npmjs.com/package/can-ndjson-stream)
    // that project however surfaces each object individually, which incurs quite a large message passing overhead from the transforming stream
    // to the reading stream.
    // Our custom version here instead batches all read objects from a single chunk and propagates those up in 1 time, which is much faster for our use case.
    // it also replaces splitting on \n by splitting on the RecordSeparator character for json-seq. Everything else is the same as NDJSON handling.

    // copyright notice for this function:
    /*
        The MIT License (MIT)

        Copyright 2017 Justin Meyer (justinbmeyer@gmail.com), Fang Lu
        (cc2lufang@gmail.com), Siyao Wu (wusiyao@umich.edu), Shang Jiang
        (mrjiangshang@gmail.com)

        Permission is hereby granted, free of charge, to any person obtaining a copy
        of this software and associated documentation files (the "Software"), to deal
        in the Software without restriction, including without limitation the rights
        to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
        copies of the Software, and to permit persons to whom the Software is
        furnished to do so, subject to the following conditions:

        The above copyright notice and this permission notice shall be included in all
        copies or substantial portions of the Software.

        THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
        IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
        AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
        LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
        OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
        SOFTWARE.
    */
    protected static createRecordTransformer( inputStream:ReadableStream ):ReadableStream {

        let is_reader:ReadableStreamReader<any>|undefined = undefined;
        let cancellationRequest:boolean = false;

        let readRecordCount = 0;

        return new ReadableStream({
            start: (controller) => {
                const reader = inputStream.getReader();
                is_reader = reader;

                const decoder = new TextDecoder();
                let data_buf = "";

                reader.read().then(function processResult(result:any):any {

                    // at the end of the stream, this function is called one last time 
                    // with result.done set and an empty result.value
                    if (result.done) {
                        if (cancellationRequest) {
                            // Immediately exit
                            return;
                        }

                        // try to process the last part of the file if possible
                        data_buf = data_buf.trim();
                        if (data_buf.length !== 0) {
                            ++readRecordCount;

                            try {
                                const data_l = JSON.parse(data_buf);
                                controller.enqueue( [data_l] ); // need to wrap in array, since that's what calling code expects
                            } 
                            catch (e) {
                                console.error("TextSequenceJSONToQlog:ondone record #" + readRecordCount + " was invalid JSON. Skipping and continuing.", data_buf);
                                // // TODO: what does this do practically? We probably want to (silently?) ignore errors?
                                // controller.error(e);
                                // return;
                            }
                        }

                        controller.close();

                        return;
                    }

                    const data = decoder.decode(result.value, {stream: true});
                    data_buf += data;

                    const records = data_buf.split("\u001E"); // \u001E is the Record Separator character

                    const output = []; // batch results together to reduce message passing overhead

                    console.log("TextsequenceJSONToQlog:createRecordTransformer Amount of records", records.length);

                    for ( let i = 0; i < records.length - 1; ++i) {

                        const r = records[i].trim();
                        
                        if (r.length > 0) {
                            ++readRecordCount;

                            try {
                                const data_record = JSON.parse(r);
                                // controller.enqueue(data_record) would immediately pass the single read object on, but we batch it instead on the next line
                                output.push( data_record );
                            }
                            catch (e) {
                                // malformed individual records are skipped so a partially corrupt
                                // stream still yields every valid record around the bad one
                                console.error("TextSequenceJSONToQlog: line #" + readRecordCount + " was invalid JSON. Skipping and continuing.", r, records.length);
                            }
                        }
                    }
                    data_buf = records[records.length - 1];

                    controller.enqueue( output );

                    return reader.read().then(processResult);
                });

            },

            cancel: (reason) => {
                console.warn("TextSequenceJSONToQlog:parseTextSequences : Cancel registered due to ", reason);

                cancellationRequest = true;

                if ( is_reader !== undefined ) {
                    is_reader.cancel();
                }
            },
        },
        // TODO: we tried to optimize a bit with this, but it doesn't seem to work (printing chunks above gives chunks of 65K, not 260K)
        // didn't immediately find a good solution for this though, seems like chunk-sizing APIs aren't well supported yet in browsers
        {
            highWaterMark: 4, // read up to 1 chunk of the following size 
            size: (chunk) => { return 262144; },
        });
    }
}
