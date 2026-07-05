<template>
    <div class="home">
        <CongestionGraphConfigurator :config="config"/>
        <div id="packetInfo" style="position: absolute; display: none; z-index: 100; padding: 5px; border: 1px solid black; background-color: white;">
            <p id="timestamp"></p>
            <p id="packetNr"></p>
            <p id="packetSize"></p>
            <p id="ackedFrom"></p>
            <p id="ackedTo"></p>
        </div>
        <CongestionGraphRenderer :config="config"/>
    </div>
</template>

<script setup lang="ts">
    import { onBeforeMount } from "vue";

    import CongestionGraphConfigurator from "./CongestionGraphConfigurator.vue";
    import CongestionGraphRenderer from "./CongestionGraphRenderer.vue";

    import { useConfigurationStore } from "@/store/ConfigurationStore";

    const store = useConfigurationStore();
    const config = store.congestionGraphConfig;

    onBeforeMount(() => {
        console.log("container created", config);
    });
</script>
