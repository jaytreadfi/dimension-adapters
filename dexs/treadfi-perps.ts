import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";

// https://www.tread.fi/
const HL_BUILDER_ADDRESS = "0x999a4b5f268a8fbf33736feff360d462ad248dbf";
const EXTENDED_BUILDER_NAME = "Tread.fi";
const EXTENDED_API_URL = "https://api.starknet.extended.exchange/api/v1/info/builder/dashboard";
const TREADTOOLS_API_URL = "https://treadtools.vercel.app/api/defillama-volume";

// Fee rate for TreadTools venues (2 bps)
const TREADTOOLS_FEE_RATE = 0.0002;

interface ExtendedDailyData {
  date: string;
  builderName: string;
  volume: string;
  extendedFees: string;
  activeUsers: number;
}

interface ExtendedApiResponse {
  status: string;
  data: {
    total: any[];
    daily: ExtendedDailyData[];
  };
}

interface TreadToolsApiResponse {
  status: string;
  data: {
    [exchange: string]: {
      dailyVolume: number;
      totalVolume: number;
    };
  };
  timestamp: string;
  queriedDate: string | null;
  dateRange: {
    start: string;
    end: string;
  };
}

const getHeaders = () => {
  const apiKey = getEnv("TREADTOOLS_API_KEY");
  if (!apiKey) {
    throw new Error("TREADTOOLS_API_KEY is required but not configured");
  }
  return {
    "Authorization": `Bearer ${apiKey}`,
  };
};

const prefetch = async (options: FetchOptions): Promise<any> => {
  try {
    const url = `${TREADTOOLS_API_URL}?timestamp=${options.startOfDay}`;
    const response: TreadToolsApiResponse = await httpGet(url, {
      headers: getHeaders(),
    });

    if (response.status !== "ok") {
      throw new Error(`API returned status: ${response.status}`);
    }
    return response;
  } catch (error: any) {
    throw new Error(`Failed to fetch TreadTools data: ${error.message}`);
  }
};

const fetchHyperliquid = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: HL_BUILDER_ADDRESS,
    });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const fetchExtended = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // Convert startOfDay timestamp to YYYY-MM-DD format
  const date = new Date(options.startOfDay * 1000);
  const dateStr = date.toISOString().split("T")[0];

  const response: ExtendedApiResponse = await httpGet(EXTENDED_API_URL);

  // Find Tread.fi data for the requested date
  const dayData = response.data.daily.find(
    (entry) => entry.builderName === EXTENDED_BUILDER_NAME && entry.date === dateStr
  );

  if (dayData) {
    const volume = parseFloat(dayData.volume);
    const fees = volume * TREADTOOLS_FEE_RATE;
    dailyVolume.addCGToken("usd-coin", volume);
    dailyFees.addCGToken("usd-coin", fees);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

// Generic fetcher for any TreadTools-sourced exchange
const createTreadToolsFetcher = (exchangeKey: string) => {
  return async (_a: any, _b: any, options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const treadToolsData = options.preFetchedResults;
    const exchangeData = treadToolsData.data?.[exchangeKey];

    if (exchangeData && typeof exchangeData.dailyVolume === "number" && exchangeData.dailyVolume > 0) {
      const volume = exchangeData.dailyVolume;
      const fees = volume * TREADTOOLS_FEE_RATE;
      dailyVolume.addCGToken("usd-coin", volume);
      dailyFees.addCGToken("usd-coin", fees);
    }

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
    };
  };
};

const methodology = {
  Fees: "Trading fees paid by users for perps in Tread.fi perps trading terminal.",
  Revenue: "Fees collected by Tread.fi as Builder Revenue from Hyperliquid and Extended Exchange.",
  ProtocolRevenue: "Fees collected by Tread.fi as Builder Revenue from Hyperliquid and Extended Exchange.",
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  adapter: {
    "Hyperliquid": {
      fetch: fetchHyperliquid,
      start: "2025-10-05",
    },
    "Extended": {
      fetch: fetchExtended,
      start: "2025-12-10",
    },
    "Paradex": {
      fetch: createTreadToolsFetcher("paradex"),
      start: "2025-11-11",
    },
    "Nado": {
      fetch: createTreadToolsFetcher("nado"),
      start: "2026-01-07",
    },
    "Pacifica": {
      fetch: createTreadToolsFetcher("pacifica"),
      start: "2025-10-30",
    },
    "Aster": {
      fetch: createTreadToolsFetcher("aster"),
      start: "2025-10-25",
    },
    "Bybit": {
      fetch: createTreadToolsFetcher("bybit"),
      start: "2025-10-13",
    },
    "Binance": {
      fetch: createTreadToolsFetcher("binance"),
      start: "2025-10-08",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
