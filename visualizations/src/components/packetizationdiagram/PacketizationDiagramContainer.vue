<template>
    <div class="home">
        <PacketizationDiagramConfigurator :config="config"/>
        <PacketizationDiagramRenderer :config="config"/>
    </div>
</template> 

<script setup lang="ts">
    import PacketizationDiagramConfigurator from "./PacketizationDiagramConfigurator.vue";
    import PacketizationDiagramRenderer from "./PacketizationDiagramRenderer.vue"; 

    import { useConfigurationStore } from "@/store/ConfigurationStore";

    const store = useConfigurationStore();
    const config = store.packetizationDiagramConfig;
</script>
