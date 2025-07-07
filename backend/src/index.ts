import express from "express";
import axios, { AxiosError } from "axios";
import { createClient } from "redis";
import dotenv from "dotenv";
import { API_BASE_URL, CACHE_TTL, PORT, REDIS_HOST } from "./constants";

dotenv.config();

const app = express();

const redisHost = process.env.REDIS_HOST || REDIS_HOST;
const redisClient = createClient({ url: `redis://${redisHost}` });
redisClient.connect().catch(console.error);

const apiKey = process.env.API_KEY || "";

const getCachedTotalCveCount = async () => {
  const cachedTotalCveCount = await redisClient.get("totalResults");
  if (cachedTotalCveCount) {
    return parseInt(cachedTotalCveCount, 10);
  }

  try {
    const response = await axios.get(API_BASE_URL, {
      params: { startIndex: 0, resultsPerPage: 1 },
      headers: { apiKey },
    });
    const totalResults = parseInt(response.data.totalResults, 10);

    await redisClient.setEx("totalResults", CACHE_TTL, totalResults.toString());

    return totalResults;
  } catch (err) {
    console.error(err);
    return 0;
  }
};

const isClientError = (err: AxiosError) => {
  const statusCode = err.response?.status || 500;
  return statusCode >= 400 && statusCode < 500;
};

app.get("/api/cve", async (req, res) => {
  const totalCveCount = await getCachedTotalCveCount();

  const offset = parseInt(req.query.startIndex as string, 10) || 0;
  if (isNaN(offset) || offset < 0) {
    res
      .status(400)
      .json({ error: "startIndex parameter must be a non-negative integer" });
    return;
  }
  if (offset >= totalCveCount) {
    res
      .status(404)
      .json({ error: "No results found for the given value for startIndex" });
    return;
  }

  const resultsPerPage = parseInt(req.query.resultsPerPage as string, 10) || 10;
  if (isNaN(resultsPerPage) || resultsPerPage < 0) {
    res
      .status(400)
      .json("resultsPerPage parameter must be a non-negative integer");
  }

  try {
    const startIndex = totalCveCount - offset - resultsPerPage;

    const params = { startIndex, resultsPerPage };
    const redisKey = JSON.stringify(params);
    const cachedRes = await redisClient.get(redisKey);

    if (cachedRes) {
      res.status(200).json(JSON.parse(cachedRes));
      return;
    }

    const response = await axios.get(API_BASE_URL, { params });
    await redisClient.setEx(redisKey, CACHE_TTL, JSON.stringify(response));
    res.status(200).json(response);
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
