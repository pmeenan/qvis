<template>
    <div style="background-color: #fff3cd; padding: 0px 10px;" >

        <div class="container-fluid">
            <div class="row justify-content-center">
                <p style="margin-top: 10px;">Select a file via the dropdown(s) below to view its statistics</p>
            </div>
            <div class="row justify-content-center">
                <ConnectionConfigurator v-if="config.group !== undefined" :allGroups="store.groups" :group="config.group" :canBeRemoved="false" :allowGroupSelection="true" :allowConnectionSelection="false" :onGroupSelected="onGroupSelected" />
            </div>

            <div v-if="store.outstandingRequestCount === 0 && store.groups.length === 0" class="alert alert-danger" role="alert">Please load a trace file to visualize it</div>
            <div v-else-if="store.groups.length === 0" class="alert alert-warning" role="alert">Loading files...</div>
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
    import { defineComponent, type PropType } from "vue";
    import StatisticsConfig from "./data/StatisticsConfig";

    import ConnectionConfigurator from "@/components/shared/ConnectionConfigurator.vue";
    import { useConnectionStore } from "@/store/ConnectionStore";
    import ConnectionGroup from "@/data/ConnectionGroup";

    export default defineComponent({
        name: "StatisticsConfigurator",
        components: {
            ConnectionConfigurator,
        },
        props: {
            config: {
                type: Object as PropType<StatisticsConfig>,
                required: true,
            },
        },
        data() {
            return {
                store: useConnectionStore(),
            };
        },
        mounted() {
            if ( this.config.group === undefined && this.store.groups.length > 0 ){
                this.selectDefault();
            }
        },
        updated() {
            if ( this.config.group === undefined && this.store.groups.length > 0 ){
                this.selectDefault();
            }
        },
        methods: {
        onGroupSelected(group:ConnectionGroup) {
            console.log("StatisticsConfigurator:onGroupSelected : ", this.config, group);

            this.config.group = group;
        },

        selectDefault(){
            console.log("selectDefault: adding new default connection configurator", this.store.groups);
            this.config.group = ( this.store.groups[0] );
        },
        },
    });

</script>
