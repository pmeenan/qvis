<template>
    <div>
        <div>Time resolution: {{config.timeResolution}}</div>

        <div class="container-fluid">
            <div class="row">
                <div class="col" v-for="(connection, index) in connections" :key="index">
                    - {{index}} : {{connection.connection.getLongName()}} (offset {{connection.timeOffset}})
                    <div v-for="(event,eventIndex) in connection.connection.getEvents()" :key="eventIndex">
                        = {{eventIndex}} : {{connection.connection.parseEvent(event).relativeTime}} {{connection.connection.parseEvent(event).category}} {{connection.connection.parseEvent(event).name}} {{(connection.connection.parseEvent(event).data && connection.connection.parseEvent(event).data.header) ? connection.connection.parseEvent(event).data.header.version : ""}}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template> 

<script lang="ts">
    import { defineComponent, type PropType } from "vue";
    import SequenceDiagramConfig from "./data/SequenceDiagramConfig";

    export default defineComponent({
        name: "SequenceDiagramSimpleRenderer",
        props: {
            config: {
                type: Object as PropType<SequenceDiagramConfig>,
                required: true,
            },
        },
        computed: {
            connections() {
                return this.config.connections;
            },
        },
        watch: {
            config: {
                immediate: true,
                deep: true,
                handler(newConfig: SequenceDiagramConfig, oldConfig: SequenceDiagramConfig) {
                    console.log("SequenceDiagramSimpleRenderer:onConfigChanged : ", newConfig, oldConfig);
                },
            },
        },
    });

</script>
