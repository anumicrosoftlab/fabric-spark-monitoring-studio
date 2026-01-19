import json
import pandas as pd

from datetime import datetime
from typing import Iterator, Tuple
from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *
from pyspark.sql.streaming.state import GroupState, GroupStateTimeout

spark.conf.set("spark.sql.streaming.stateStore.providerClass", "org.apache.spark.sql.execution.streaming.state.RocksDBStateStoreProvider")
spark.conf.set("spark.sql.shuffle.partitions", "1")

PRODUCER_READ_CONNECTION = "{PRODUCER_READ_CONNECTION}"
CONSUMER_WRITE_CONNECTION = "{CONSUMER_WRITE_CONNECTION}"
PRODUCER_EH_NAME = PRODUCER_READ_CONNECTION.split("EntityPath=")[1].split(";")[0]
HEARTBEAT_GRACE_PERIOD_MS = 5000
CHECKPOINT_LOCATION = "Files/checkpoints/heartbeat_state_stream"

class HeartbeatStatus:
    HEALTHY = "Healthy"
    INITIALIZING = "Initializing"
    UNHEALTHY = "Unhealthy"

heartbeat_input_schema = StructType([StructField("machine_name", StringType(), True), StructField("machine_time", StringType(), True)])
state_schema = StructType([StructField("heartbeat_status", StringType(), True)])
output_schema = StructType([StructField("machine_name", StringType(), True), StructField("last_status_change_time", TimestampType(), True), StructField("status", StringType(), True)])

def create_starting_positions(eh_name, num_partitions=1):
    position_map = {}
    for partition_id in range(num_partitions):
        position_key = { "ehName": eh_name, "partitionId": partition_id }
        event_position = { "offset": "@latest", "seqNo": -1, "enqueuedTime": None, "isInclusive": True }
        position_map[json.dumps(position_key)] = event_position
    return json.dumps(position_map)

inputEhConf = {
    "eventhubs.connectionString": sc._jvm.org.apache.spark.eventhubs.EventHubsUtils.encrypt(PRODUCER_READ_CONNECTION),
    "eventhubs.consumerGroup": "$Default",
    "eventhubs.startingPositions": create_starting_positions(PRODUCER_EH_NAME, num_partitions=1)
}

outputEhConf = {
    "eventhubs.connectionString": sc._jvm.org.apache.spark.eventhubs.EventHubsUtils.encrypt(CONSUMER_WRITE_CONNECTION)
}

def heartbeat_state_transition(
    key: Tuple[str],
    pdf_iter: Iterator[pd.DataFrame],
    state: GroupState
) -> Iterator[pd.DataFrame]:
    """
    State machine for tracking machine health based on heartbeats.
    
    Transitions: None → Initializing → Healthy ↔ Unhealthy (on timeout)
    Only emits output when state changes.
    """
    machine_name = key[0]
    
    if state.hasTimedOut:
        state.remove()
        yield pd.DataFrame({"machine_name": [machine_name], "last_status_change_time": [datetime.now()], "status": [HeartbeatStatus.UNHEALTHY]})
        return
    
    all_heartbeats = []
    for pdf in pdf_iter:
        if not pdf.empty:
            all_heartbeats.append(pdf)
    
    if not state.exists:
        state.setTimeoutTimestamp(state.getCurrentWatermarkMs() + HEARTBEAT_GRACE_PERIOD_MS)
        state.update((HeartbeatStatus.INITIALIZING,))
        yield pd.DataFrame({"machine_name": [machine_name], "last_status_change_time": [datetime.now()], "status": [HeartbeatStatus.INITIALIZING]})
        return
    
    if all_heartbeats:
        state.setTimeoutTimestamp(state.getCurrentWatermarkMs() + HEARTBEAT_GRACE_PERIOD_MS)
        previous_state = state.get
        previous_heartbeat_status = previous_state[0] if previous_state else HeartbeatStatus.UNHEALTHY
        current_heartbeat_status = HeartbeatStatus.HEALTHY
        state.update((current_heartbeat_status,))
        
        if previous_heartbeat_status != current_heartbeat_status:
            yield pd.DataFrame({"machine_name": [machine_name], "last_status_change_time": [datetime.now()], "status": [current_heartbeat_status]})
        else:
            yield pd.DataFrame(columns=["machine_name", "last_status_change_time", "status"])
    else:
        yield pd.DataFrame(columns=["machine_name", "last_status_change_time", "status"])

raw_stream = (
    spark.readStream
    .format("eventhubs")
    .options(**inputEhConf)
    .load()
)

heartbeats = (
    raw_stream
    .select(col("enqueuedTime").alias("event_time"), from_json(col("body").cast("string"), heartbeat_input_schema).alias("data"))
    .select("event_time", "data.*")
    .withWatermark("event_time", "30 seconds")
)

machine_status_stream = (
    heartbeats
    .groupBy("machine_name")
    .applyInPandasWithState(
        heartbeat_state_transition,
        outputStructType=output_schema,
        stateStructType=state_schema,
        outputMode="update",
        timeoutConf=GroupStateTimeout.EventTimeTimeout
    )
)

if notebookutils.fs.exists(CHECKPOINT_LOCATION):
    notebookutils.fs.rm(CHECKPOINT_LOCATION, recurse=True)

query = (
    machine_status_stream
    .filter(col("machine_name").isNotNull())
    .select(to_json(struct("*")).alias("body"))
    .writeStream
    .format("eventhubs")
    .options(**outputEhConf)
    .outputMode("update")
    .option("checkpointLocation", CHECKPOINT_LOCATION)
    .trigger(processingTime="0 seconds")
    .queryName("heartbeat_state_stream")
    .start()
)

query.awaitTermination()