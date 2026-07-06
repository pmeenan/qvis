<template>
    <div class="eventlog-view">
        <EventLogContainer />
    </div>
</template>

<style scoped>
    /* Fill exactly the viewport space below the menu: flex-basis 0 so the
       virtualized lists inside never inflate the page height (their scroll
       content would otherwise become the flex-basis and push #app past 100%). */
    .eventlog-view {
        flex: 1 1 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
</style>

<script setup lang="ts">
    import EventLogContainer from "@/components/eventlog/EventLogContainer.vue";
</script>
