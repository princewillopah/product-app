package com.observability.product;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;

@SpringBootApplication
public class ProductServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(ProductServiceApplication.class, args);
    }

    @Bean
    public OncePerRequestFilter requestIdFilter() {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request,
                                          HttpServletResponse response,
                                          FilterChain filterChain) throws ServletException, IOException {
                String requestId = request.getHeader("X-Request-ID");
                if (requestId == null || requestId.isEmpty()) {
                    requestId = UUID.randomUUID().toString();
                }
                
                MDC.put("request_id", requestId);
                response.setHeader("X-Request-ID", requestId);
                
                try {
                    filterChain.doFilter(request, response);
                } finally {
                    MDC.clear();
                }
            }
        };
    }
}
