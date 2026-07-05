<template>
    <div class="home">
        <StatisticsConfigurator :config="config"/>
        <StatisticsRenderer :config="config"/>
    </div>
</template>

<script setup lang="ts">
    import { onBeforeMount } from "vue";

    import StatisticsConfigurator from "./StatisticsConfigurator.vue";
    import StatisticsRenderer from "./StatisticsRenderer.vue";

    import { useConfigurationStore } from "@/store/ConfigurationStore";

    const store = useConfigurationStore();
    const config = store.statisticsConfig;

    onBeforeMount(() => {
        console.log("statistics container created", config);
    });
</script>
