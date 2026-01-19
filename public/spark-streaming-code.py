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

# Event Hub connection configuration
EVENTHUB_CONNECTION_STRING = "{CONSUMER_CONNECTION_STRING}"

ehConf = {
    "eventhubs.connectionString": 
        sc._jvm.org.apache.spark.eventhubs.EventHubsUtils
          .encrypt(EVENTHUB_CONNECTION_STRING),
    "eventhubs.consumerGroup": "$Default",
    "eventhubs.startingPosition": 
        '{"offset": "-1", "enqueuedTime": null}'
}

# Define schema for heartbeat events
heartbeat_schema = StructType([
    StructField("deviceId", StringType(), True),
    StructField("timestamp", TimestampType(), True),
    StructField("status", StringType(), True)
])

# Read from Event Hub stream
raw_stream = (
    spark.readStream
    .format("eventhubs")
    .options(**ehConf)
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

# Write health state to delta table
query = (
    device_health
    .writeStream
    .format("delta")
    .outputMode("complete")
    .option("checkpointLocation", "/tmp/heartbeat_checkpoint")
    .table("device_health_state")
)

query.awaitTermination()
