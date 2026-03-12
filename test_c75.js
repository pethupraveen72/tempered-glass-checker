
import * as cheerio from "cheerio";

async function run() {
    try {
        const cfWorkerUrl = "https://glass-proxy.pethupraveen72.workers.dev/";
        const gsmTarget = "https://www.gsmarena.com/res.php3?sSearch=xiaomi+poco+c75";
        
        const res = await fetch(`${cfWorkerUrl}?url=${encodeURIComponent(gsmTarget)}`);
        const html = await res.text();
        const $ = cheerio.load(html);
        
        let link = "";
        $(".makers ul li a").each((i, el) => {
            if (!link && $(el).text().toLowerCase().includes("c75")) {
                link = "https://www.gsmarena.com/" + $(el).attr("href");
            }
        });
        
        if (link) {
            console.log("GSM Link:", link);
            const res2 = await fetch(`${cfWorkerUrl}?url=${encodeURIComponent(link)}`);
            const html2 = await res2.text();
             const $prod = cheerio.load(html2);
            const displayRes = $prod("[data-spec=\"displayresolution\"]").text().toLowerCase();
            const displayType = $prod("[data-spec=\"displaytype\"]").text().toLowerCase();
            const metaDesc = $prod("meta[name=\"Description\"]").attr("content") || "";
            const descText = metaDesc.toLowerCase();
            console.log("GSMArena Desc:", descText);
            console.log("GSMArena Res:", displayRes);
            console.log("GSMArena Type:", displayType);
        }
    } catch(e) {
        console.error(e);
    }
}
run();

