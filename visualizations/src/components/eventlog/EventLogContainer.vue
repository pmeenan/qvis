<template>
    <div class="home">
        <EventLogConfigurator :config="config"/>
        <EventLogRenderer :config="config"/>
    </div>
</template>

<style scoped>
    /* Middle link of the EventLog flex chain (see views/EventLog.vue): pass the
       remaining viewport height down to the renderer while keeping the
       configurator at its natural height. */
    .home {
        flex: 1 1 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .home > :first-child {
        flex: 0 0 auto;
    }
</style>

<script setup lang="ts">
    import EventLogConfigurator from "./EventLogConfigurator.vue";
    import EventLogRenderer from "./EventLogRenderer.vue";

    import { useConfigurationStore } from "@/store/ConfigurationStore";

    const store = useConfigurationStore();
    const config = store.eventLogConfig;
</script>
