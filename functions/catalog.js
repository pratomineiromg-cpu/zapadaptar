export function publicProduct(id, data) {
  return { id, name: data.name, description: data.description || '', image: data.image || '',
    category: data.category || '', price: data.price, tamanhos: (data.tamanhos || []).map(({ label, price }) => ({ label, price })) };
}

export function priceBasket(basket, products, fee) {
  if (!Array.isArray(basket) || !basket.length || basket.length > 80) throw Error('Carrinho inválido.');
  function cents(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw Error('Preço inválido.');
    return Math.round(value * 100);
  }
  let subtotalCents = 0;
  const items = basket.map(({ productId, selectedSize, quantity }) => {
    const product = products.find(item => item.id === productId);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw Error('Item indisponível.');
    const size = product.tamanhos.find(size => size.label === selectedSize);
    if (product.tamanhos.length ? !size : selectedSize !== 'Único') throw Error('Tamanho indisponível.');
    const unitCents = cents(size?.price ?? product.price);
    subtotalCents += unitCents * quantity;
    return { productId, productName: product.name, selectedSize, quantity, selectedSizePrice: unitCents / 100,
      subtotal: unitCents * quantity / 100, selectedAddons: [], removedItems: [], selectedUtensils: [] };
  });
  const deliveryFeeCents = cents(fee);
  return { items, subtotalCents, deliveryFeeCents, totalCents: subtotalCents + deliveryFeeCents };
}
