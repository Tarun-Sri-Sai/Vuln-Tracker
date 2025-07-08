import express from "express";
import axios, { AxiosError } from "axios";
import { createClient } from "redis";
import dotenv from "dotenv";
import { API_BASE_URL, PORT, REDIS_HOST } from "./constants/endpoints";
import { CACHE_TTL } from "./constants/redis";

dotenv.config();

const app = express();

const redisHost = process.env.REDIS_HOST || REDIS_HOST;
const redisClient = createClient({ url: `redis://${redisHost}` });
redisClient.connect().catch(console.error);

const apiKey = process.env.API_KEY || "";

const isClientError = (err: AxiosError) => {
  const statusCode = err.response?.status || 500;
  return statusCode >= 400 && statusCode < 500;
};

app.get("/api/cves", async (req, res) => {
  try {
    const params = Object.keys(req.query)
      .sort()
      .reduce((acc, key) => {
        acc[key] = req.query[key];
        return acc;
      }, {} as Record<string, any>);
    const redisKey = JSON.stringify(params);

    const cachedRes = await redisClient.get(redisKey);
    if (cachedRes) {
      res.status(200).json(JSON.parse(cachedRes));
      return;
    }

    const response = await axios.get(API_BASE_URL, { params });
    const resData = response.data;
    await redisClient.setEx(redisKey, CACHE_TTL, JSON.stringify(resData));
    res.status(200).json(resData);
  } catch (err) {
    console.error(err);

    if (axios.isAxiosError(err) && isClientError(err)) {
      const { status, headers, data } = err.response ?? {
        status: 500,
        headers: { message: "Upstream error" },
        data: {},
      };

      res.status(status).json({ error: headers.message, data });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

const port = process.env.PORT || PORT;
app.listen(port, () => console.log(`Running on port ${port}`));
