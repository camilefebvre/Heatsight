# Indicateurs EF v3.0 retenus pour l'ACV 2.0.
# Les clés correspondent aux champs dans LcaMaterial.impacts (produit par _EF_COLUMN_PATTERNS).

LCA_V2_INDICATORS: dict[str, str] = {
    "gwp100": (
        "Climate change: total (EF v3.0 - IPCC 2013) | "
        "global warming potential (GWP100)"
    ),
    "energy_nonrenewable": (
        "Energy resources: non-renewable | "
        "abiotic depletion potential (ADP): fossil fuels"
    ),
    "photochemical_oxidant": (
        "Photochemical oxidant formation: human health | "
        "tropospheric ozone concentration increase"
    ),
}
