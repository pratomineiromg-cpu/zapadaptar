export function publicProduct(id, data) {
  const options = values => (values || []).map(({id,name,price}) => ({id,name,price}));
  return { id, name: data.name, description: data.description || '', image: data.image || '',
    category: data.category || '', price: data.price, tamanhos: (data.tamanhos || []).map(({ label, price }) => ({ label, price })),
    adicionais: options(data.adicionais), utensilios: options(data.utensilios), naoMandar: (data.naoMandar || []).filter(v=>typeof v === 'string') };
}

export function priceBasket(basket, products, fee) {
  if (!Array.isArray(basket) || !basket.length || basket.length > 80) throw Error('Carrinho inválido.');
  function cents(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw Error('Preço inválido.');
    return Math.round(value * 100);
  }
  let subtotalCents = 0;
  function select(ids, catalog, key) {
    if (!Array.isArray(ids) || ids.length > catalog.length || new Set(ids).size !== ids.length) throw Error('Seleção de opções inválida.');
    return ids.map(id => {
      const option = catalog.find(entry => key(entry) === id);
      if (typeof id !== 'string' || !option) throw Error('Opção indisponível.');
      return option;
    });
  }
  const items = basket.map(({ productId, selectedSize, quantity, addonIds = [], utensilIds = [], removedItems = [], observation = '' }) => {
    const product = products.find(item => item.id === productId);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw Error('Item indisponível.');
    const size = product.tamanhos.find(size => size.label === selectedSize);
    if (product.tamanhos.length ? !size : selectedSize !== 'Único') throw Error('Tamanho indisponível.');
    const selectedAddons = select(addonIds,product.adicionais || [],o=>o.id);
    const selectedUtensils = select(utensilIds,product.utensilios || [],o=>o.id);
    const removals = select(removedItems,product.naoMandar || [],v=>v);
    if (typeof observation !== 'string' || observation.length > 300) throw Error('Observação inválida.');
    const baseCents = cents(size?.price ?? product.price);
    const unitCents = [...selectedAddons,...selectedUtensils].reduce((sum,o)=>sum+cents(o.price),baseCents);
    subtotalCents += unitCents * quantity;
    return { productId, productName: product.name, selectedSize, quantity, selectedSizePrice: baseCents / 100, unitPrice: unitCents / 100,
      subtotal: unitCents * quantity / 100, selectedAddons, removedItems: removals, selectedUtensils, observation: observation.trim() };
  });
  const deliveryFeeCents = cents(fee);
  return { items, subtotalCents, deliveryFeeCents, totalCents: subtotalCents + deliveryFeeCents };
}
