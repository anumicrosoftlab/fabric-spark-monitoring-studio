# Spark Structured Streaming with RocksDB State Store
# This notebook reads heartbeat events and tracks device health

from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *

# Configure Spark with RocksDB state store
spark.conf.set(
    "spark.sql.streaming.stateStore.providerClass",
    "com.databricks.sql.streaming.state.RocksDBStateStoreProvider"
)

# Event Hub connection configuration - Producer Read (input)
PRODUCER_READ_CONNECTION = "{PRODUCER_READ_CONNECTION}"

# Event Hub connection configuration - Consumer Write (output)  
CONSUMER_WRITE_CONNECTION = "{CONSUMER_WRITE_CONNECTION}"

# Input Event Hub config (read heartbeats from producer)
inputEhConf = {
    "eventhubs.connectionString": 
        sc._jvm.org.apache.spark.eventhubs.EventHubsUtils
          .encrypt(PRODUCER_READ_CONNECTION),
    "eventhubs.consumerGroup": "$Default",
    "eventhubs.startingPosition": 
        '{"offset": "-1", "enqueuedTime": null}'
}

# Output Event Hub config (write health state to consumer)
outputEhConf = {
    "eventhubs.connectionString": 
        sc._jvm.org.apache.spark.eventhubs.EventHubsUtils
          .encrypt(CONSUMER_WRITE_CONNECTION)
}

# Define schema for heartbeat events
heartbeat_schema = StructType([
    StructField("deviceId", StringType(), True),
    StructField("timestamp", TimestampType(), True),
    StructField("status", StringType(), True)
])

# Read from Event Hub stream (Producer Read)
raw_stream = (
    spark.readStream
    .format("eventhubs")
    .options(**inputEhConf)
    .load()
)

# Parse heartbeat events
heartbeats = (
    raw_stream
    .select(from_json(col("body").cast("string"), heartbeat_schema).alias("data"))
    .select("data.*")
    .withWatermark("timestamp", "10 seconds")
)

# Track device health state with 5-second timeout
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

# Write health state to Event Hub (Consumer Write)
query = (
    device_health
    .select(to_json(struct("*")).alias("body"))
    .writeStream
    .format("eventhubs")
    .options(**outputEhConf)
    .outputMode("complete")
    .option("checkpointLocation", "/tmp/heartbeat_checkpoint")
    .start()
)

query.awaitTermination()
