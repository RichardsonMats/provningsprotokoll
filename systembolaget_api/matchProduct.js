import { searchProducts }            from "./client.js";
import { createSystembolagetProduct } from "./RetailItem.js";

const WEIGHTS = {
    name: 0.45,
    brand: 0.15,
    volume: 0.15,
    price: 0.05,
    country: 0.2,
};

const MATCH_THRESHOLD = 0.1;
const RATIO_SIMILARITY_CUTOFF = 5;
const ABV_MISSING_SCORE_FACTOR = 0.8;

const NAME_STOPWORDS = new Set([
    "de", "la", "le", "les", "du", "des", "del", "di", "da", "do",
    "d", "l", "the", "and", "of", "for", "med", "och",
]);

const GENERIC_BRANDS = new Set([
    "ovrige", "övrige", "övriga", "øvrige", "diverse", "other", "unknown", "okänd", "okand",
]);

const EU_COUNTRIES = new Set([
    "austria", "belgium", "bulgaria", "croatia", "cyprus", "czechia", "denmark",
    "estonia", "finland", "france", "germany", "greece", "hungary", "ireland",
    "italy", "latvia", "lithuania", "luxembourg", "malta", "netherlands", "poland",
    "portugal", "romania", "slovakia", "slovenia", "spain", "sweden",
    "osterrike", "belgien", "bulgarien", "kroatien", "cypern", "tjeckien", "danmark",
    "estland", "finland", "frankrike", "tyskland", "grekland", "ungern", "irland",
    "italien", "lettland", "litauen", "luxemburg", "malta", "nederlanderna", "polen",
    "portugal", "rumanien", "slovakien", "slovenien", "spanien", "sverige",
]);

function tokenize(text) {
    if (!text) return [];

    const normalized = text
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ø/gi, "o");

    return normalized
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function normalizeText(text) {
    return tokenize(text).join(" ");
}

function canonicalCountry(country) {
    const norm = normalizeText(country);
    if (!norm) return "";

    const aliases = {
        "eu": "eu",
        "european union": "eu",
        "europeiska unionen": "eu",
        "europa": "eu",
        "sweden": "sverige",
        "sverige": "sverige",
        "denmark": "danmark",
        "danmark": "danmark",
        "norway": "norge",
        "norge": "norge",
        "finland": "finland",
        "germany": "tyskland",
        "tyskland": "tyskland",
        "france": "frankrike",
        "frankrike": "frankrike",
        "italy": "italien",
        "italien": "italien",
        "spain": "spanien",
        "spanien": "spanien",
        "united states": "usa",
        "usa": "usa",
    };

    return aliases[norm] ?? norm;
}

function isEuCountry(countryCanonical) {
    if (!countryCanonical || countryCanonical === "eu") return false;

    if (EU_COUNTRIES.has(countryCanonical)) {
        return true;
    }

    const aliasesToEnglish = {
        "sverige": "sweden",
        "danmark": "denmark",
        "norge": "norway",
        "tyskland": "germany",
        "frankrike": "france",
        "italien": "italy",
        "spanien": "spain",
    };

    const english = aliasesToEnglish[countryCanonical];
    return english ? EU_COUNTRIES.has(english) : false;
}

function significantTokens(text) {
    return tokenize(text).filter((t) => !NAME_STOPWORDS.has(t) && t.length > 1);
}

function tokenSimilarity(aText, bText) {
    const a = new Set(significantTokens(aText));
    const b = new Set(significantTokens(bText));

    if (a.size === 0 || b.size === 0) return 0;

    let shared = 0;
    for (const t of a) {
        if (b.has(t)) shared++;
    }

    // Dice coefficient in [0, 1]
    return (2 * shared) / (a.size + b.size);
}

function hasUsableBrand(brand) {
    const norm = normalizeText(brand);
    if (!norm) return false;
    return !GENERIC_BRANDS.has(norm);
}

function isSameABV(a, b) {
    if (a == null || b == null) return false;
    return Math.abs(a - b) < 0.001;
}

function ratioSimilarity(a, b, rareCutoffRatio = RATIO_SIMILARITY_CUTOFF) {
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
        return 0;
    }

    const smaller = Math.min(a, b);
    const larger = Math.max(a, b);
    const ratio = larger / smaller;

    if (ratio <= 1) return 1;
    if (ratio >= rareCutoffRatio) return 0;

    return 1 - ((ratio - 1) / (rareCutoffRatio - 1));
}

function candidateNameText(item) {
    return `${item.name ?? ""} ${item.subtitle ?? ""}`.trim();
}

function candidateBrandText(item) {
    return `${item.producer ?? ""} ${item.name ?? ""} ${item.subtitle ?? ""}`.trim();
}

function computeBrandSimilarity(fleggaardBrand, candidate) {
    const producerText = `${candidate.producer ?? ""}`.trim();
    const itemNameText = candidateNameText(candidate);
    const combinedText = candidateBrandText(candidate);

    const producerSim = tokenSimilarity(fleggaardBrand, producerText);
    const nameSim = tokenSimilarity(fleggaardBrand, itemNameText);
    const combinedSim = tokenSimilarity(fleggaardBrand, combinedText);

    // "märke" may refer to producer OR product brand in the item name.
    // Use the best signal to avoid penalizing correct matches.
    return Math.max(producerSim, nameSim, combinedSim);
}

function computePriceSimilarity(fleggaard, candidate) {
    const flPpl = fleggaard?.pricePerLiter?.sek ?? null;
    const sbPpl = candidate?.pricePerLiterSek ?? null;
    if (flPpl != null && sbPpl != null) {
        return ratioSimilarity(flPpl, sbPpl);
    }

    const flPrice = fleggaard?.price ?? null;
    const sbPrice = candidate?.price ?? null;
    return ratioSimilarity(flPrice, sbPrice);
}

function computeCountryAgreement(fleggaard, candidate) {
    const fl = canonicalCountry(fleggaard.country);
    const sb = canonicalCountry(candidate.country);

    // Neutral if one or both are missing.
    if (!fl || !sb) {
        return 0.5;
    }

    if (fl === "eu" && isEuCountry(sb)) {
        return 0.8;
    }

    if (sb === "eu" && isEuCountry(fl)) {
        return 0.8;
    }

    // Agree or disagree.
    return fl === sb ? 1 : 0;
}

function computeComponentScores(fleggaard, candidate) {
    const nameSim = tokenSimilarity(fleggaard.fullName, candidateNameText(candidate));

    const brandUsable = hasUsableBrand(fleggaard.brand);
    const brandSim = brandUsable
        ? computeBrandSimilarity(fleggaard.brand, candidate)
        : 0.5;

    const volumeSim = ratioSimilarity(fleggaard.volumeMl, candidate.volumeMl);
    const priceSim = computePriceSimilarity(fleggaard, candidate);
    const countrySim = computeCountryAgreement(fleggaard, candidate);

    return {
        name: nameSim,
        brand: brandSim,
        volume: volumeSim,
        price: priceSim,
        country: countrySim,
    };
}

function weightedScore(components, hasABV) {
    const base = (
        WEIGHTS.name * components.name +
        WEIGHTS.brand * components.brand +
        WEIGHTS.volume * components.volume +
        WEIGHTS.price * components.price + 
        WEIGHTS.country * components.country
    );


    // If ABV is missing in source data, lower confidence so other aspects
    // must match better to pass threshold.
    return hasABV ? base : base * ABV_MISSING_SCORE_FACTOR;
}

function rankCandidates(candidates, fleggaard, hasABV) {
    return candidates
        .map((candidate) => {
            const components = computeComponentScores(fleggaard, candidate);
            return {
                ...candidate,
                score: weightedScore(components, hasABV),
                similarity: components,
            };
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const pa = (a.price != null && Number.isFinite(a.price)) ? a.price : Number.POSITIVE_INFINITY;
            const pb = (b.price != null && Number.isFinite(b.price)) ? b.price : Number.POSITIVE_INFINITY;
            return pa - pb;
        });
}

async function queryCandidates(query, hasABV, abv) {
    const raw = await searchProducts(query, { size: 30, filterMode: "none" });
    let mapped = raw.map(createSystembolagetProduct);

    if (hasABV) {
        mapped = mapped.filter((item) => isSameABV(item.abv, abv));
    }

    return mapped;
}

export async function matchProduct({ name, brand, abv, volumeMl, price, pricePerLiter, country }) {
    const fullName = (name ?? "").trim();
    if (!fullName) {
        return { status: "no_match", query: "", matches: [], threshold: MATCH_THRESHOLD, weights: WEIGHTS };
    }

    const fleggaard = {
        fullName,
        brand: (brand ?? "").trim(),
        volumeMl: (volumeMl != null && Number.isFinite(volumeMl)) ? volumeMl : null,
        price: (price != null && Number.isFinite(price)) ? price : null,
        pricePerLiter: pricePerLiter ?? null,
        country: (country ?? "").trim(),
    };

    const hasABV = abv != null && Number.isFinite(abv);
    const words = fullName.split(/\s+/).filter(Boolean);

    for (let wordCount = words.length; wordCount >= 1; wordCount--) {
        const query = words.slice(0, wordCount).join(" ");
        const candidates = await queryCandidates(query, hasABV, abv);

        if (candidates.length === 0) {
            continue;
        }

        const ranked = rankCandidates(candidates, fleggaard, hasABV);
        const aboveThreshold = ranked.filter((item) => item.score >= MATCH_THRESHOLD);

        if (aboveThreshold.length === 0) {
            continue;
        }

        const topMatches = aboveThreshold.slice(0, 3);
        return {
            status: topMatches.length === 1 ? "single_match" : "multiple_matches",
            query,
            matches: topMatches,
            threshold: MATCH_THRESHOLD,
            weights: WEIGHTS,
        };
    }

    return {
        status: "no_match",
        query: "",
        matches: [],
        threshold: MATCH_THRESHOLD,
        weights: WEIGHTS,
    };
}
