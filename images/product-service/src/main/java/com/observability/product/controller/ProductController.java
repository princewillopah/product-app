package com.observability.product.controller;

import com.observability.product.model.Product;
import com.observability.product.service.ProductService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/products")
@Slf4j
public class ProductController {
    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    public ResponseEntity<List<Product>> getAllProducts() {
        log.info("GET /api/products");
        return ResponseEntity.ok(productService.getAllProducts());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Product> getProduct(@PathVariable String id) {
        log.info("GET /api/products/{}", id);
        return productService.getProductById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Product> createProduct(@RequestBody Product product) {
        if (!isValidProduct(product)) {
            log.warn("Invalid product payload received on create");
            return ResponseEntity.badRequest().build();
        }
        log.info("POST /api/products: {}", product.getName());
        return ResponseEntity.ok(productService.createProduct(product));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Product> updateProduct(@PathVariable String id, @RequestBody Product product) {
        if (!isValidProduct(product)) {
            log.warn("Invalid product payload received on update for id {}", id);
            return ResponseEntity.badRequest().build();
        }
        log.info("PUT /api/products/{}", id);
        return ResponseEntity.ok(productService.updateProduct(id, product));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProduct(@PathVariable String id) {
        log.info("DELETE /api/products/{}", id);
        productService.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("healthy");
    }

    private boolean isValidProduct(Product product) {
        if (product == null) {
            return false;
        }

        return hasText(product.getName())
            && hasText(product.getDescription())
            && hasText(product.getCategory())
            && product.getPrice() != null
            && product.getStock() != null;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
