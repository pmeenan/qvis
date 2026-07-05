<template>
    <div id="MainMenu" class="container-fluid">
        <div class="row">
            <div class="col-1 col-md-auto align-middle"><h3 style="width: 290px;">qvis</h3></div>
            <div class="col">
                <ul class="nav nav-tabs justify-content-center">
                    <li v-if="!embeddedMode" class="nav-item files-link">
                        <router-link to="/files" class="nav-link" :class="{ active: route.fullPath.indexOf('/files') >= 0 || route.fullPath === '' }">
                        Manage files
                        </router-link>
                    </li>
                    <li class="nav-item sequence-link">
                        <router-link to="/sequence" class="nav-link" :class="{ active: route.fullPath.indexOf('/sequence') >= 0 }">
                        Sequence
                        </router-link>
                    </li>
                    <li class="nav-item congestion-link">
                        <router-link to="/congestion" class="nav-link" :class="{ active: route.fullPath.indexOf('/congestion') >= 0 }">
                        Congestion
                        </router-link>
                    </li>
                    <li class="nav-item multiplexing-link">
                        <router-link to="/multiplexing" class="nav-link" :class="{ active: route.fullPath.indexOf('/multiplexing') >= 0 }">
                        Multiplexing
                        </router-link>
                    </li>
                    <li class="nav-item packetization-link">
                        <router-link to="/packetization" class="nav-link" :class="{ active: route.fullPath.indexOf('/packetization') >= 0 }">
                        Packetization
                        </router-link>
                    </li>
                    <li class="nav-item stats-link">
                        <router-link to="/stats" class="nav-link" :class="{ active: route.fullPath.indexOf('/stats') >= 0 }">
                        qlog stats
                        </router-link>
                    </li>
                </ul>
            </div>
            <div v-if="!embeddedMode" class="col-1 col-md-auto">
                <a class="btn btn-success" href="https://github.com/quiclog/qvis/issues/new?template=feature_request.md&amp;title=Feature+request" target="_blank" style="margin-right: 5px;">Request feature</a>
                <a class="btn btn-danger" href="https://github.com/quiclog/qvis/issues/new?template=bug-report-in-live-version.md&amp;title=Bug+in+live+version" target="_blank">Report issue</a>
            </div>
        </div>
    </div>
</template>

<style scoped>
    #MainMenu{
        width: 100%;
        background-color: black;
        color: white;
        padding-top: 5px;
        /*
        text-align: center;
        line-height: 1em;
        height: 25px;
        padding-top: 10px;
        */
    }

    #MainMenu .nav-tabs{
        border-bottom: none;
    }

    #MainMenu .nav-tabs .nav-item {
        margin-left: 3px;
    }

    #MainMenu .nav-tabs .nav-link {
        background-color: lightgrey;
        color: black;
        border-bottom: none;
    }

    #MainMenu li.files-link a.active {
        color: black;
        font-weight: bold;
        background-color: #fff;
        border-bottom-color: #fff;
    }

    #MainMenu li.sequence-link a.active {
        color: black;
        font-weight: bold;
        background-color: #cce5ff;
        border-bottom-color: #cce5ff;
    }

    #MainMenu li.congestion-link a.active {
        color: black;
        font-weight: bold;
        background-color: #d4edda;
        border-bottom-color: #d4edda;
    }

    #MainMenu li.multiplexing-link a.active {
        color: black;
        font-weight: bold;
        background-color: #d1ecf1;
        border-bottom-color: #d1ecf1;
    }

    #MainMenu li.packetization-link a.active {
        color: black;
        font-weight: bold;
        background-color: #f8d7da;
        border-bottom-color: #f8d7da;
    }
    

    #MainMenu li.stats-link a.active {
        color: black;
        font-weight: bold;
        background-color: #fff3cd;
        border-bottom-color: #fff3cd;
    }

    /* #MainMenu a.router-link-exact-active {
        background-color: white;
        color: black;
    } */

</style>

<script setup lang="ts">
    import { onMounted } from "vue";
    import { useRoute } from "vue-router";
    import { isEmbeddedMode } from "@/embed";

    const route = useRoute();
    const embeddedMode = isEmbeddedMode();

    onMounted(() => {
        console.log( route );
    });
</script>
