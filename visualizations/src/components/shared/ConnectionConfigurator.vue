<template>
    <div class="col connection-configurator" style="background-color: white; color: black; border: black 1px solid; max-width: 50%;">
        <div class="container-fluid">
            <div v-if="allowGroupSelection && !allowConnectionSelection">
                <select v-model="selectedGroup" class="form-select mb-3 mt-3" @change="onGroupSelectionChanged(selectedGroup)">
                    <option v-for="option in groupOptions" :key="option.text" :value="option.value" :disabled="option.disabled">
                        {{ option.text }}
                    </option>
                </select>
            </div>

            <div v-else>
                <div v-if="tooManyOptions">
                    <!-- separate-select mode -->
                    <!--<div>{{selectedGroup.filename}} - {{selectedGroup.description}}</div> -->
                    <select v-model="selectedGroup" class="form-select mb-3 mt-3" @change="onGroupSelectionChanged(selectedGroup)">
                        <option v-for="option in groupOptions" :key="option.text" :value="option.value" :disabled="option.disabled">
                            {{ option.text }}
                        </option>
                    </select>

                    <!--<div>{{selectedConnection.events.length}} - {{selectedConnection.parent.description}}</div> -->
                    <select v-model="selectedConnection" class="form-select mb-3" @change="onConnectionSelectionChanged(selectedConnection)">
                        <option v-for="option in connectionOptions" :key="option.text" :value="option.value" :disabled="option.disabled">
                            {{ option.text }}
                        </option>
                    </select>
                
                    <button v-if="canBeRemoved" type="button" class="btn btn-secondary" @click="removeMyself">&minus;</button> 
                </div>

                <div v-else>
                    <!-- combined-select mode -->
                    <div class="row mt-3">
                        <div class="col"><div>{{selectedConnection?.parent.filename}} ({{selectedConnection?.parent.description}})</div></div>
                        <div class="col-2" v-if="numericalInputName"><div title="This value is automatically calculated, but can be manually adjusted.">{{numericalInputName}} : </div></div>
                        <div style="max-width: 36px;" v-if="canBeRemoved"></div>
                    </div>
                    <div class="row mb-3">
                        <div class="col">
                            <select v-model="selectedConnection" class="form-select" @change="onConnectionSelectionChanged(selectedConnection)">
                                <option v-for="option in combinedOptions" :key="option.text" :value="option.value" :disabled="option.disabled">
                                    {{ option.text }}
                                </option>
                            </select>
                        </div>
                        <div class="col-2" v-if="numericalInputName"><input type="number" class="form-control" v-model="numericalValue" @change="onNumericalValueUpdated(numericalValue)" /></div>
                        <div class="col-auto px-0" v-if="canBeRemoved"><button type="button" class="btn btn-secondary" @click="removeMyself">&minus;</button></div>
                    </div>
                </div>

                
            </div>
        
        </div>
    </div>
</template> 

<script setup lang="ts">
    import { computed, ref, watch } from "vue";

    import ConnectionGroup from "@/data/ConnectionGroup";
    import Connection from "@/data/Connection";
    import QlogConnection from '@/data/Connection';
    import { getRealConnections } from "@/components/shared/helpers/ConnectionSelectionHelper";

    // ConnectionConfigurator is used to select a single connection for one vertical line in the SequenceDiagram
    // All the Renderer cares about is the Connection, but here for our selection we also need ConnectionGroup
    // So we pass in all possible ConnectionGroups (this.allGroups) and then allow the user to select the connection they want
    // We provide two modes: all in 1 select (when there aren't too many options) and 2 selects (1 for the group, then the connection)
    // This latter one is for when there are too many options and a single select would be too unwieldy
    const props = withDefaults(defineProps<{
        // passing in connection allows us to set it externally as well (e.g., loading from config string, loading premade testcase)
        connection?: Connection;
        group?: ConnectionGroup;
        allGroups: Array<ConnectionGroup>;
        numericalInputValue?: number;
        numericalInputName?: string;
        canBeRemoved?: boolean;
        allowGroupSelection?: boolean;
        allowConnectionSelection?: boolean;
        // When true, connections synthesized by the sequence diagram renderer
        // (wasAutoGenerated, "Simulated, autogenerated trace : ...") are excluded
        // from every option list (and groups left with zero real connections are
        // skipped entirely). Default false so the sequence diagram — the only tab
        // where the simulated sibling is a meaningful choice — keeps its current
        // behavior unchanged.
        excludeAutoGenerated?: boolean;
        onGroupSelected?: (group: ConnectionGroup) => void;
        onConnectionSelected?: (conn: QlogConnection) => void;
        onNumericalValueChanged?: (offset:number) => void;
        onRemoved?: () => void;
    }>(), {
        canBeRemoved: true,
        allowGroupSelection: false,
        allowConnectionSelection: true,
        excludeAutoGenerated: false,
    });

    const selectedConnection = ref<Connection | undefined>(props.connection);
    const selectedGroup = ref<ConnectionGroup>(props.group ? props.group : props.connection!.parent);
    const numericalValue = ref<number | undefined>(props.numericalInputValue);

    // Firstly, when we change our selection from inside this component, we propagate it to our parent in onSelectionChanged
    // The parent then sets this.connection, but this.selectedGroup is not automatically co-updated
    // so, we manually do that here.
    // Secondly, if we change the connection from outside, this.selectedConnection is not updated, so we do that here
    // TODO: this feels dirty... figure out a better way to do two-way binding of these vars between outside and inside
    watch(() => props.connection, (newConnection, oldConnection) => {
        if ( !newConnection ) {
            return;
        }

        console.log("ConnectionConfigurator:onConnectionChanged : setting selectedGroup : ", newConnection.title, oldConnection?.title, newConnection, oldConnection);
        selectedGroup.value = newConnection.parent;
        if ( selectedConnection.value !== newConnection ) {
            selectedConnection.value = newConnection;
        }

        numericalValue.value = props.numericalInputValue;
    }, { immediate: false, deep: false });

    const tooManyOptions = computed(() => {
        // TODO: we can do this without creating the combinedOptions array with a for-loop
        // TODO: maybe allow passing as a prop?
        return combinedOptions.value.length > 30;
    });

    // the connections of a group that should be offered as options
    // (everything by default; only real, non-simulated ones under :excludeAutoGenerated)
    function selectableConnections(group:ConnectionGroup): Array<Connection> {
        if ( !props.excludeAutoGenerated ) {
            return group.getConnections();
        }

        return getRealConnections(group);
    }

    // The template renders these as native select options.
    // used in separate-select mode
    const groupOptions = computed(() => {
        const options:any = [];
        for ( const group of props.allGroups ) {
            if ( selectableConnections(group).length === 0 ) {
                continue;
            }
            options.push( { value: group, text: group.filename + " (" + (group.title ? group.title + " : " : "") + group.description + ")" } );
        }

        return options;
    });

    // used in separate-select mode
    const connectionOptions = computed(() => {
        const options:any = [];
        for ( const connection of selectableConnections(selectedGroup.value) ) {

            let connectionName = "";
            if ( connection.vantagePoint ){
                if (connection.vantagePoint.name){
                    connectionName += connection.vantagePoint.name + " : ";
                }
                if (connection.vantagePoint.type){
                    connectionName += connection.vantagePoint.type;
                }
                else {
                    connectionName += "UNKNOWN";
                }

                connectionName += (connection.vantagePoint && connection.vantagePoint.flow) ? " (flow = " + connection.vantagePoint.flow + ") : " : " : ";
            }
            if ( connection.title ) {
                connectionName += connection.title;
            }
            if (connection.description) {
                connectionName +=  " : " + connection.description;
            }

            options.push( { value: connection, text: connectionName } );
        }

        return options;
    });

    // used in combined-select mode
    const combinedOptions = computed(() => {
        const options:any = [];

        for ( const group of props.allGroups ) {
            const connections = selectableConnections(group);
            if ( connections.length === 0 ) {
                continue;
            }

            options.push( { value: null, text: group.filename, disabled: !props.allowGroupSelection } );

            for ( const connection of connections ) {
                let connectionName = "";
                if ( connection.vantagePoint ){
                    if (connection.vantagePoint.name){
                        connectionName += connection.vantagePoint.name + " : ";
                    }
                    if (connection.vantagePoint.type){
                        connectionName += connection.vantagePoint.type;
                    }
                    else {
                        connectionName += "UNKNOWN";
                    }

                    connectionName += (connection.vantagePoint && connection.vantagePoint.flow) ? " (flow = " + connection.vantagePoint.flow + ") : " : " : ";
                }
                if ( connection.title ) {
                    connectionName += connection.title;
                }
                if (connection.description) {
                    connectionName +=  " : " + connection.description;
                }

                options.push( { value: connection, text: "↳ " + connectionName } );
            }
        }

        return options;
    });

    // used in separate-select mode
    function onGroupSelectionChanged(newlySelected:ConnectionGroup){
        // this.selectedGroup is the PREVIOUS selection for some reason
        console.log("Selected a new group", selectedGroup.value, newlySelected);

        if ( props.allowGroupSelection && props.onGroupSelected ){
            props.onGroupSelected( selectedGroup.value );
        }

        if ( props.allowConnectionSelection ){
            // auto-select the first connection in the list (honoring :excludeAutoGenerated)
            selectedConnection.value = selectableConnections(newlySelected)[0];

            onConnectionSelectionChanged( selectedConnection.value );
        }
    }

    // used in separate-select and combined-select mode
    function onConnectionSelectionChanged(newlySelected:Connection | null | undefined){
        if ( !newlySelected ) {
            return;
        }

        console.log("Selected a new connection", selectedConnection.value, newlySelected);
        props.onConnectionSelected?.( newlySelected );
    }

    function removeMyself(){
        props.onRemoved?.();
    }

    function onNumericalValueUpdated(val:any){
        if ( props.onNumericalValueChanged ) {
            props.onNumericalValueChanged( parseFloat(val) );
        }
    }
</script>
