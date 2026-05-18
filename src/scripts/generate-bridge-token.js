// -----------------------------------------------------------------------------
//
// File: src/scripts/generate-bridge-token.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
// No partnership, approval, or official relationship with Mojang AB or Microsoft is implied.
//
// All names, logos, brands, trademarks, service marks, and registered trademarks are the
// property of their respective owners and are used strictly for identification/reference only.
// This project does not claim ownership of third-party IP and provides no license to use it.
//
// -----------------------------------------------------------------------------

require("dotenv").config();
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error("JWT_SECRET is missing or too short.");
    process.exit(1);
}

const sub = process.env.CATALOG_BRIDGE_TOKEN_SUB || "catalog-bridge";
const role = process.env.CATALOG_BRIDGE_TOKEN_ROLE || "admin";
const expiresIn = process.env.CATALOG_BRIDGE_TOKEN_EXPIRES_IN || "365d";

const token = jwt.sign({sub, role, purpose: "catalog-bridge"}, JWT_SECRET, {expiresIn});
console.log(token);
