import * as cheerio from "cheerio";
import { fetch } from "undici"; // Node 18+ has fetch, but just in case, or we use global fetch

async function runTest(modelName) {
    const cfWorkerUrl = "https://glass-proxy.pethupraveen72.workers.dev/";
    
    console.log(`Testing model: ${modelName}`);
    
    // 1. GSM Arena Search
    const gsmSearchUrl = `https://www.gsmarena.com/res.php3?sSearch=${encodeURIComponent(modelName)}`;
    let gsmLink = "";
    try {
        const res = await fetch(`${cfWorkerUrl}?url=${encodeURIComponent(gsmSearchUrl)}`);
        const html = await res.text();
        const $ = cheerio.load(html);
        
        $(".makers ul li a").each((i, el) => {
            if (!gsmLink) gsmLink = "https://www.gsmarena.com/" + $(el).attr("href");
        });
        
        console.log("GSMArena Link:", gsmLink || "Not found");
        
        if (gsmLink) {
            const res2 = await fetch(`${cfWorkerUrl}?url=${encodeURIComponent(gsmLink)}`);
            const html2 = await res2.text();
            const $prod = cheerio.load(html2);
            
            const displayRes = $prod('[data-spec="displayresolution"]').text().toLowerCase();
            const displayType = $prod('[data-spec="displaytype"]').text().toLowerCase();
            const metaDesc = $prod('meta[name="Description"]').attr('content')?.toLowerCase() || "";
            
            console.log("GSMArena Desc:", metaDesc);
            console.log("GSMArena Res:", displayRes);
            console.log("GSMArena Type:", displayType);
            
            let detectedNotch = 'Punch Hole';
            if (metaDesc.includes('punch hole') || displayRes.includes('punch hole') || displayType.includes('punch hole') || metaDesc.match(/(\d+)mp.+punch/)) detectedNotch = 'Punch Hole';
            else if (metaDesc.includes('water drop') || displayRes.includes('waterdrop') || metaDesc.includes('tear drop') || metaDesc.includes('dewdrop') || metaDesc.includes('dot drop') || metaDesc.includes('v-notch') || metaDesc.includes('u-notch')) detectedNotch = 'Waterdrop';
            else if (metaDesc.includes('dynamic island')) detectedNotch = 'Dynamic Island';
            
            console.log("GSMArena Detected Notch:", detectedNotch);
            
            const bodyText = $prod('body').text().toLowerCase();
            let screenType = "Flat";
            if (bodyText.includes('curved display') || modelName.toLowerCase().includes('edge')) screenType = "Curved";
            else if (bodyText.includes('2.5d')) screenType = "2.5D";
            
            console.log("GSMArena Detected Screen:", screenType);
        }
    } catch(e) { console.error("GSM Error:", e.message); }
    
    // 2. Kimovil
    try {
        const slug = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const targetUrl = `https://www.kimovil.com/en/where-to-buy-${slug}?q=gsmarena.com`;
        const res = await fetch(`${cfWorkerUrl}?url=${encodeURIComponent(targetUrl)}`);
        if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            let text = "";
            $("dt:contains('Screen'), dt:contains('Design'), td:contains('Screen')").each((i, el) => {
                text += $(el).parent().text().replace(/\s+/g, ' ').trim().toLowerCase() + " ";
            });
            console.log("Kimovil Text:", text || "Not found");
            
            if (text) {
                if (text.includes("curved") || text.includes("dual edge")) console.log("Kimovil Detected: Curved");
                else if (text.includes("2.5d") || text.includes("2.5 d")) console.log("Kimovil Detected: 2.5D");
                else console.log("Kimovil Detected: Flat (Fallback)");
            }
        }
    } catch(e) { console.error("Kimovil Error:", e.message); }

    // 3. Smartprix
    try {
        const searchUrl = `https://www.smartprix.com/mobiles?q=${encodeURIComponent(modelName)}&gsmarena.com`;
        const res = await fetch(`${cfWorkerUrl}?url=${encodeURIComponent(searchUrl)}`);
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
            
            console.log("Smartprix Link:", targetLink || "Not found");
            
            if (targetLink) {
                const detailRes = await fetch(`${cfWorkerUrl}?url=${encodeURIComponent(targetLink)}`);
                const detailHtml = await detailRes.text();
                const $d = cheerio.load(detailHtml);
                const notchText = ($d("td:contains('Notch')").next().text() || $d("td:contains('Punch Hole')").text() || "").toLowerCase();
                
                console.log("Smartprix Notch Text:", notchText);
                
                let smartprixNotch = null;
                if (notchText.includes("punch hole")) smartprixNotch = "Punch Hole";
                else if (notchText.includes("water drop") || notchText.includes("waterdrop")) smartprixNotch = "Waterdrop";
                else if (notchText.includes("dynamic island")) smartprixNotch = "Dynamic Island";
                else if (notchText.includes("pop-up") || notchText.includes("popup")) smartprixNotch = "Popup Camera";
                else if (notchText.includes("yes")) smartprixNotch = "Wide Notch";
                
                console.log("Smartprix Detected Notch:", smartprixNotch || "None");
            }
        }
    } catch(e) { console.error("Smartprix Error:", e.message); }
}

runTest("POCO C85");
// Also test POCO C75 directly, maybe they are similar
runTest("POCO C75");
