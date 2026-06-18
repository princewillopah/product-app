package com.observability.product.service;

import com.observability.product.model.Product;
import com.observability.product.repository.ProductRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@Slf4j
public class ProductService {
    private final ProductRepository productRepository;
    private final Counter productCreatedCounter;
    private final Counter productUpdatedCounter;
    private final Counter productDeletedCounter;

    public ProductService(ProductRepository productRepository, MeterRegistry meterRegistry) {
        this.productRepository = productRepository;
        this.productCreatedCounter = Counter.builder("products.created.total")
            .description("Total products created")
            .register(meterRegistry);
        this.productUpdatedCounter = Counter.builder("products.updated.total")
            .description("Total products updated")
            .register(meterRegistry);
        this.productDeletedCounter = Counter.builder("products.deleted.total")
            .description("Total products deleted")
            .register(meterRegistry);
    }

    public Product createProduct(Product product) {
        product.setCreatedAt(LocalDateTime.now());
        product.setUpdatedAt(LocalDateTime.now());
        Product saved = productRepository.save(product);
        productCreatedCounter.increment();
        log.info("Product created: {}", saved.getId());
        return saved;
    }

    public List<Product> getAllProducts() {
        log.info("Fetching all products");
        return productRepository.findAll();
    }

    public Optional<Product> getProductById(String id) {
        log.info("Fetching product: {}", id);
        return productRepository.findById(id);
    }

    public Product updateProduct(String id, Product product) {
        Optional<Product> existing = productRepository.findById(id);
        if (existing.isPresent()) {
            Product p = existing.get();
            p.setName(product.getName());
            p.setDescription(product.getDescription());
            p.setPrice(product.getPrice());
            p.setStock(product.getStock());
            p.setCategory(product.getCategory());
            p.setUpdatedAt(LocalDateTime.now());
            Product updated = productRepository.save(p);
            productUpdatedCounter.increment();
            log.info("Product updated: {}", id);
            return updated;
        }
        throw new RuntimeException("Product not found: " + id);
    }

    public void deleteProduct(String id) {
        productRepository.deleteById(id);
        productDeletedCounter.increment();
        log.info("Product deleted: {}", id);
    }
}
