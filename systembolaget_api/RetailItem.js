// Factory for a product scraped from Fleggaard.
export function createFleggaardProduct(data) {
    return {
        name:           data.name           ?? null,
        normalizedName: data.normalizedName ?? null,
        abv:            data.abv            ?? null,
        unitVolumeMl:   data.unitVolumeMl   ?? null,
        totalVolumeMl:  data.totalVolumeMl  ?? null,
        packCount:      data.packCount      ?? 1,
        price:          data.price          ?? null,
        currency:       data.currency       ?? null,
        pricePerLiter:  data.pricePerLiter  ?? null,  // { euro, sek }
        sku:            data.sku            ?? null,
        brand:          data.brand          ?? null,
    };
}

// Factory for a product returned from the Systembolaget search API.
// Accepts the raw JSON object from the API response.
export function createSystembolagetProduct(raw) {
    const pickString = (...values) => {
        for (const value of values) {
            if (typeof value === "string" && value.trim() !== "") {
                return value;
            }
            if (value && typeof value === "object") {
                if (typeof value.name === "string" && value.name.trim() !== "") {
                    return value.name;
                }
                if (typeof value.value === "string" && value.value.trim() !== "") {
                    return value.value;
                }
            }
        }
        return null;
    };

    const productId        = raw.productId ?? null;
    const productNumber    = raw.productNumber ?? null;
    const abv              = raw.alcoholPercentage ?? null;
    const volumeMl         = raw.volume            ?? null;
    const price            = raw.price             ?? null;
    const pricePerLiterSek = (price && volumeMl)   ? price / (volumeMl / 1000) : null;
    const apk              = (abv && pricePerLiterSek) ? (abv * 10) / pricePerLiterSek : null;
    const urlQuery         = productNumber ?? productId;
    const friendlyUrl      = raw.friendlyUrl ?? null;
    const producer         = raw.producerName
                             ?? raw.producer
                             ?? raw.manufacturer
                             ?? raw.supplier
                             ?? null;
    const country          = pickString(
                                raw.country,
                                raw.originLevel1,
                                raw.originLevel2,
                                raw.originLevel3,
                                raw.origin,
                                raw.countryName,
                            );
    const imageUrl         = raw.images?.find((item) => item?.imageUrl)?.imageUrl ?? null;
    const image            = imageUrl?.endsWith(".png") ? imageUrl : imageUrl ? `${imageUrl}.png` : null;
    const tasteClocks      = [
        ["Beska", raw.tasteClockBitter],
        ["Fruktsyra", raw.tasteClockFruitacid],
        ["Fyllighet", raw.tasteClockBody],
        ["Stravhet", raw.tasteClockRoughness],
        ["Sotma", raw.tasteClockSweetness],
        ["Rokighet", raw.tasteClockSmokiness],
    ].filter(([, value]) => Number.isFinite(value) && value > 0)
        .map(([label, value]) => ({ label, value }));

    return {
        productId,
        productNumber,
        name:            raw.productNameBold ?? null,
        subtitle:        raw.productNameThin ?? null,
        producer,
        country,
        abv,
        volumeMl,
        price,
        pricePerLiterSek,
        apk,
        packaging:       raw.bottleText      ?? null,
        vintage:         raw.vintage         ?? null,
        image,
        category:        pickString(raw.categoryLevel3, raw.categoryLevel2, raw.categoryLevel1),
        taste:           raw.taste           ?? null,
        tasteClocks,
        // Prefer a direct friendly URL when present; otherwise fall back to
        // a query URL using product number/id to avoid 404 links.
        url:             friendlyUrl
                             ? `https://www.systembolaget.se${friendlyUrl}`
                             : urlQuery
                             ? `https://www.systembolaget.se/sortiment/?q=${encodeURIComponent(urlQuery)}`
                             : null,
    };
}
