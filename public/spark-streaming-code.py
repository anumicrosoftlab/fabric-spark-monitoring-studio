import json
from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *

spark.conf.set("spark.sql.streaming.stateStore.providerClass", "org.apache.spark.sql.execution.streaming.state.RocksDBStateStoreProvider")
spark.conf.set("spark.sql.shuffle.partitions", "1")

PRODUCER_READ_CONNECTION = "{PRODUCER_READ_CONNECTION}"
CONSUMER_WRITE_CONNECTION = "{CONSUMER_WRITE_CONNECTION}"

PRODUCER_EH_NAME = PRODUCER_READ_CONNECTION.split("EntityPath=")[1].split(";")[0]

def create_starting_positions(eh_name, num_partitions=1):
    """
    Create a JSON string for starting positions for each partition in the Event Hub.
    
    :param eh_name: Name of the Event Hub
    :param num_partitions: Number of partitions in the Event Hub
    :return: JSON string representing starting positions
    """
    position_map = {}
    for partition_id in range(num_partitions):
        position_key = {
            "ehName": eh_name,
            "partitionId": partition_id
        }
        event_position = {
            "offset": "@latest",
            "seqNo": -1,
            "enqueuedTime": None,
            "isInclusive": True
        }
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

heartbeat_schema = StructType([
    StructField("deviceId", StringType(), True),
    StructField("timestamp", TimestampType(), True),
    StructField("status", StringType(), True)
])

raw_stream = (
    spark.readStream
    .format("eventhubs")
    .options(**inputEhConf)
    .load()
)

heartbeats = (
    raw_stream
    .select(from_json(col("body").cast("string"), heartbeat_schema).alias("data"))
    .select("data.*")
    .withWatermark("timestamp", "10 seconds")
)

device_health = (
    heartbeats
    .groupBy("deviceId")
    .agg(
        max("timestamp").alias("lastHeartbeat"),
        count("*").alias("heartbeatCount")
    )
    .withColumn(
        "isHealthy",
        when(
            current_timestamp() - col("lastHeartbeat") < expr("INTERVAL 5 SECONDS"),
            lit(True)
        ).otherwise(lit(False))
    )
)

query = (
    device_health
    .select(to_json(struct("*")).alias("body"))
    .writeStream
    .format("eventhubs")
    .options(**outputEhConf)
    .outputMode("complete")
    .option("checkpointLocation", "Files/checkpoints/heartbeat")
    .start()
)

query.awaitTermination()