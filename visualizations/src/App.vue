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
        /* Column-flex shell so viewport-filling views (Events) can size to the
           space below the menu with an exact flex chain instead of guessing the
           menu+configurator height with calc(100vh - Npx). min-height (not
           height) keeps normal document flow + body scrolling for the tall
           content views (sequence diagram / stats tables) — the sequence
           renderer's virtualization listens on window scroll, so page-level
           scrolling must stay the scroll mechanism. */
        min-height: 100%;
        display: flex;
        flex-direction: column;
        /* Two elements carry id="app": the index.html mount container and this
           template root (Vue 3 mounts INSIDE the container instead of replacing
           it like Vue 2 did). This rule styles both. The flex shorthand below
           is what lets the inner root grow to fill the outer container — its
           percentage min-height alone cannot resolve against the container's
           auto height, and without it the whole shell collapses to the menu
           height and the Events flex chain gets zero space. */
        flex: 1 1 auto;
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
