package io.github.elhart05.bikeshare.instrumenter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import spoon.Launcher;
import spoon.reflect.declaration.CtClass;
import spoon.reflect.declaration.CtMethod;

class ServiceSpanRuleTest {

    private static final String SOURCE = """
            @org.springframework.stereotype.Service
            class FleetService {
                public int turnoverIndex(String code) { return 0; }
                int internal() { return 0; }
                @io.opentelemetry.instrumentation.annotations.WithSpan("existing")
                public void annotated() { }
                public void explicit(Object tracer) { tracer.spanBuilder("x"); }
            }
            """;

    private final CtClass<?> type = Launcher.parseClass(SOURCE);
    private final ServiceSpanRule rule = new ServiceSpanRule();

    private CtMethod<?> method(String name) {
        return type.getMethodsByName(name).get(0);
    }

    @Test
    void public_service_method_is_selected_and_named_after_operation() {
        assertTrue(rule.isToBeProcessed(method("turnoverIndex")));
        assertEquals("fleet.turnover_index", ServiceSpanRule.spanName(method("turnoverIndex")));
    }

    @Test
    void non_public_method_is_ignored() {
        assertFalse(rule.isToBeProcessed(method("internal")));
    }

    @Test
    void method_with_existing_span_is_ignored() {
        assertFalse(rule.isToBeProcessed(method("annotated")));
        assertFalse(rule.isToBeProcessed(method("explicit")));
    }

    @Test
    void non_service_class_is_ignored() {
        CtClass<?> other = Launcher.parseClass("class Other { public void m() { } }");
        assertFalse(rule.isToBeProcessed(other.getMethodsByName("m").get(0)));
    }
}
