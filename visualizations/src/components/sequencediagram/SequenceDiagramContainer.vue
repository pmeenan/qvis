<template>
    <div class="home">
        <SequenceDiagramConfigurator :config="config"/>
        <SequenceDiagramRenderer :config="config"/>
        <!--<SequenceDiagramSimpleRenderer :config="config"/>-->
    </div>
</template> 

<script setup lang="ts">
    import SequenceDiagramConfigurator from "./SequenceDiagramConfigurator.vue";
    import SequenceDiagramRenderer from "./SequenceDiagramRenderer.vue"; 

    import { useConfigurationStore } from "@/store/ConfigurationStore";

    const store = useConfigurationStore();

        // We want to share some stuff between our configurator (choosing which files to show, default RTT, scaling, etc.)
        // and our actual renderer. 
        // The canonical way to do this would be to put everything on the app store 
        // and just have the components access the store directly.
        // However, that's a bit dirty, so instead this top-level component fetches the stored state 
        // and distributes it over the children, who need not know about the app store 
    const config = store.sequenceDiagramConfig;

        // TODO: get rid of this. Is just to test if we can use $data stuff in computed getters and pass them as props while keeping reactivity
        // get configGetter() {
        //    return this.config;
        // }
</script>
