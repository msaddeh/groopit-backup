export async function getTrendingProductsFromAI() {
    const response = await fetch("https://getaiproducts-73fzypbopa-uc.a.run.app");

    const data = await response.json();
    return data.products || [];
  }
  