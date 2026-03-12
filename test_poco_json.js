import * as cheerio from "cheerio";
import { fetch } from "undici";
import * as fs from "fs";

async function runTest(modelName) {
    const cfWorkerUrl = "https://glass-proxy.pethupraveen72.workers.dev/";
    const results = { model: modelName };
    
    try {
        const smartprixSearchUrl = `https://www.smartprix.com/mobiles?q=${encodeURIComponent(modelName)}&gsmarena.com`;
        const res = await fetch(`${cfWorkerUrl}?url=${encodeURIComponent(smartprixSearchUrl)}`);
        if (res.ok) {
            const searchHtml = await res.text();
            const $s = cheerio.load(searchHtml);
            let targetLink = null;
            const searchTerms = modelName.toLowerCase().split(" ").filter(t => t.length > 2);
            
            $s(".sm-product").each((i, el) => {
                if (!targetLink) {
                    const name = $s(el).find("h2").text().toLowerCase().trim();
                    const escapedModel = modelName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const strictRegex = new RegExp(`\\b${escapedModel}\\b`, "i");
                    const isMatch = Math.abs(name.length - modelName.length) < 15 && searchTerms.every(term => name.includes(term));
                    if (strictRegex.test(name) || isMatch) {
                        targetLink = "https://www.smartprix.com" + $s(el).find("a").attr("href") + "?q=gsmarena.com";
                    }
                }
            });
            results.smartprixLink = targetLink;
            
            if (targetLink) {
                const detailRes = await fetch(`${cfWorkerUrl}?url=${encodeURIComponent(targetLink)}`);
                const detailHtml = await detailRes.text();
                const $d = cheerio.load(detailHtml);
                const notchText = ($d("td:contains('Notch')").next().text() || $d("td:contains('Punch Hole')").text() || "").toLowerCase();
                
                results.rawNotchText = notchText;
            }
        }
    } catch(e) { }
    return results;
}

async function main() {
    const r1 = await runTest("POCO C85");
    fs.writeFileSync("poco.json", JSON.stringify(r1, null, 2));
}
main();
