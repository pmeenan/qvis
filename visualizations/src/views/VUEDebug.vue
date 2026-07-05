<template>
    <div class="home">
        <HelloWorld msg="This is the VUE debugger to test reactive data coupling"/>

        <button type="button" class="btn btn-secondary" @click="AddRandomConnection()">Add new random ConnectionGroup</button> | 
        <button type="button" class="btn btn-secondary" @click="DeleteFirstConnection()">Delete First</button> | 
        <button type="button" class="btn btn-secondary" @click="ChangeConnectionName()">Change Connection Name</button> | 
        <button type="button" class="btn btn-secondary" @click="ChangeEventName()">Change Event Name</button> | 
        <button type="button" class="btn btn-secondary" @click="RemoveEvent()">RemoveEvent</button>

        <div v-for="connectionGroup in groups" v-bind:key="connectionGroup.description">
            {{ connectionGroup.description }}
        </div>
        <div v-for="(connection, index) in connections" :key="index">
            <div v-for="(event, index) in connection.getEvents()" :key="index">
                - Event: ROBIN : {{ connection.title }} : {{ connection.parseEvent(event).name }}
            </div>
        </div>

    </div>
</template> 

<script setup lang="ts">
    import { computed, onBeforeMount } from "vue";
    import HelloWorld from "@/components/HelloWorld.vue";

    import { useConnectionStore } from "@/store/ConnectionStore";
    import ConnectionGroup from "@/data/ConnectionGroup";

    const store = useConnectionStore();

    const groups = computed(() => store.groups);
    const connections = computed(() => {
        if ( store.groups.length > 0 ) {
            return store.groups[ store.groups.length - 1 ].getConnections();
        }
        else {
            return undefined;
        }
    });

    onBeforeMount(() => {
        // TODO: only here for debug reasons obviously
        if ( store.groups.length <= 1 ){
            AddRandomConnection();
            AddRandomConnection();
            AddRandomConnection();
        }
    });

    function AddRandomConnection() {
        const filename:string = "RandomConnectionGroup " + Math.round(Math.random() * 100);
        store.DEBUG_LoadRandomFile( filename ).then((cgroup:ConnectionGroup) => {
            console.log("ConnectionGroup added. This is called AFTER the mutation has been committed to the store!", cgroup);
        });
    }

    function DeleteFirstConnection() {
        store.deleteGroup( groups.value[0] );
    }

    function ChangeEventName() {
        connections.value![0].getEvents()[0][2] = "Event was changed";
        console.log("Event name was changed, but SHOULD NOT reflect in UI since events are no longer reactive!", connections.value![0]);
    }

    function ChangeConnectionName() {
        connections.value![0].title = "Connection name was changed";
        console.log("Connection name was changed", connections.value![0]);
    }

    function RemoveEvent() {
        const events = connections.value![0].getEvents();
        events.splice( events.length - 1, 1 );
    }
</script>
