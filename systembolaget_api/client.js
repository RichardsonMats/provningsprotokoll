const SEARCH_URL = "https://api-extern.systembolaget.se/sb-api-ecommerce/v1/productsearch/search";
const SB_HOME    = "https://www.systembolaget.se";

let cachedAPIKey = null;

// Scrapes the Systembolaget frontend to extract the API key embedded in a JS
// bundle chunk, mirroring the technique used by the Go library.
async function getAPIKey() {
    if (cachedAPIKey) return cachedAPIKey;

    const res  = await fetch(SB_HOME);
    const html = await res.text();

    const chunkRegex = /src="(\/_next\/static\/chunks\/[^"]+\.js)"/g;
    const paths = [];
    let match;
    while ((match = chunkRegex.exec(html)) !== null) {
        paths.push(SB_HOME + match[1]);
    }

    for (const path of paths) {
        try {
            const chunkRes = await fetch(path);
            const source   = await chunkRes.text();
            const keyMatch = source.match(/NEXT_PUBLIC_API_KEY_APIM:"([^"]+)"/);
            if (keyMatch) {
                cachedAPIKey = keyMatch[1];
                return cachedAPIKey;
            }
        } catch (_) {
            // try next chunk
        }
    }

    throw new Error("Could not find Systembolaget API key in any script chunk");
}

// Calls the Systembolaget search endpoint.
// Returns an array of raw product objects (up to `size`, sorted by Score).
export async function searchProducts(query, {
    size = 3,
    abv = null,
    volumeMl = null,
    filterMode = "none", // "none" | "exact" | "range"
} = {}) {
    const apiKey = await getAPIKey();

    const params = new URLSearchParams({
        textQuery:     query,
        size:          String(size),
        sortBy:        "Score",
        sortDirection: "Descending",
    });

    if (filterMode !== "none") {
        if (abv != null && Number.isFinite(abv)) {
            if (filterMode === "exact") {
                // Try exact ABV first; if API precision differs, caller can retry with range.
                const exact = String(abv);
                params.set("alcoholPercentage.min", exact);
                params.set("alcoholPercentage.max", exact);
            } else {
                const minAbv = Math.max(0, abv - 0.6);
                const maxAbv = abv + 0.6;
                params.set("alcoholPercentage.min", String(minAbv));
                params.set("alcoholPercentage.max", String(maxAbv));
            }
        }

        if (volumeMl != null && Number.isFinite(volumeMl)) {
            if (filterMode === "exact") {
                const exactVolume = String(Math.round(volumeMl));
                params.set("volume.min", exactVolume);
                params.set("volume.max", exactVolume);
            } else {
                const delta = Math.max(50, Math.round(volumeMl * 0.15));
                const minVolume = Math.max(0, Math.round(volumeMl - delta));
                const maxVolume = Math.round(volumeMl + delta);
                params.set("volume.min", String(minVolume));
                params.set("volume.max", String(maxVolume));
            }
        }
    }

    const res = await fetch(`${SEARCH_URL}?${params}`, {
        headers: {
            "Ocp-Apim-Subscription-Key": apiKey,
            "Origin":                    SB_HOME,
            "Accept":                    "application/json",
        },
    });

    if (!res.ok) {
        if (res.status === 401) cachedAPIKey = null; // force key refresh next call
        throw new Error(`Systembolaget search failed: ${res.status}`);
    }

    const data = await res.json();
    return data.products ?? [];
}
