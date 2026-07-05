<template>
    <div class="home">
        <MultiplexingGraphConfigurator :config="config"/>
        <MultiplexingGraphRenderer :config="config"/>
    </div>
</template> 

<script setup lang="ts">
    import MultiplexingGraphConfigurator from "./MultiplexingGraphConfigurator.vue";
    import MultiplexingGraphRenderer from "./MultiplexingGraphRenderer.vue";

    import { useConfigurationStore } from "@/store/ConfigurationStore";

    const store = useConfigurationStore();
    const config = store.multiplexingGraphConfig;
</script>
