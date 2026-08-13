const ExaModule = require("exa-js");
const Exa = ExaModule.default || ExaModule;

const exa = new Exa(process.env.EXA_API_KEY || "");

async function search() {
  try {
    const response = await exa.search("time tracking collaboration tools project management platforms", {
      numResults: 15,
      type: "auto"
    });

    const results = response.results || [];
    
    // Extract and format results
    const formatted = results.map((result, idx) => {
      return {
        index: idx + 1,
        title: result.title || "Unknown",
        url: result.url || "No URL",
        snippet: result.snippet || "No snippet",
      };
    });

    console.log(JSON.stringify(formatted, null, 2));

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

search();
