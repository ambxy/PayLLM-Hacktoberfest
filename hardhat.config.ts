import { defineConfig } from "hardhat/config";
import toolbox from "@nomicfoundation/hardhat-toolbox-viem";
export default defineConfig({
  plugins: [toolbox],
  solidity: {
    version: "0.8.37",
    settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
  },
  paths: { sources: "./contracts", tests: "./contracts/test" },
});
