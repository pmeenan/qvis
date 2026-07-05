<template>
    <div id="app">
        <router-view name="menu"/>
        <router-view />
        <notifications group="default" position="bottom center" width="50%" />
    </div>
</template>

<style>
    html, body {
        height: 100%;
        padding: 0;
        margin: 0;
    }

    #app {
        font-family: 'Avenir', Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-align: left;
        color: #2c3e50;
    }

    .vue-notification.warn, .vue-notification.error {
        color: black;
    }

    /* .vue-notification .end {
        background-color: #007bff;
        border-left-color: #003f83;
    } */

</style>


<script setup lang="ts">
    import { onMounted } from "vue";
    import { useRoute } from "vue-router";

    import { isEmbeddedMode } from "@/embed";
    import { useConnectionStore } from "@/store/ConnectionStore";

    const route = useRoute();
    const store = useConnectionStore();

    onMounted(() => {
        if ( !isEmbeddedMode() && Object.keys(route.query).length > 0 ){
            store.loadFilesFromServer( route.query );
        }
    });
</script>
