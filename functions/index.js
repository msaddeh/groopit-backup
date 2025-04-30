const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const cors = require("cors")({ origin: true });

exports.getAIProducts = onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const apiKey = "AIzaSyAyNlezq1YXgd5ueCLBBQujxp1i85gMzr4";
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: "List the 5 hottest trending products for group buying online. Only return the product names."
                }
              ]
            }
          ]
        },
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      const raw = response.data;
      const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const products = text.split("\n").map(line => line.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);

      res.status(200).json({ products });
    } catch (error) {
      logger.error("Error from Gemini:", error?.response?.data || error.message);
      res.status(500).json({ error: "Error retrieving trending products" });
    }
  });
});
