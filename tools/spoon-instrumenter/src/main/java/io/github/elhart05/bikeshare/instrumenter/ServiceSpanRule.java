package io.github.elhart05.bikeshare.instrumenter;

import java.util.List;

import io.opentelemetry.instrumentation.annotations.WithSpan;
import spoon.processing.AbstractProcessor;
import spoon.reflect.code.CtInvocation;
import spoon.reflect.declaration.CtMethod;
import spoon.reflect.declaration.CtType;
import spoon.reflect.visitor.filter.TypeFilter;

/**
 * The rule: every public method of a {@code @Service} class gets
 * {@code @WithSpan}, named after the operation ("fleet.turnover_index").
 *
 * <p>Unless it already has a span, declared by annotation or built with
 * {@code spanBuilder}. Two spans for the same work would add nothing.</p>
 *
 * <p>Everything goes through the model: the rule adds an annotation node to a
 * method and never edits text.</p>
 */
public class ServiceSpanRule extends AbstractProcessor<CtMethod<?>> {

    @Override
    public boolean isToBeProcessed(CtMethod<?> method) {
        return method.isPublic()
                && isService(method.getDeclaringType())
                && !hasSpan(method);
    }

    @Override
    public void process(CtMethod<?> method) {
        getFactory().Annotation().annotate(method, WithSpan.class, "value", spanName(method));
        System.out.println("  @WithSpan(\"" + spanName(method) + "\") on "
                           + method.getDeclaringType().getSimpleName() + "." + method.getSimpleName());
    }

    private static boolean isService(CtType<?> type) {
        return type.getAnnotations().stream()
                .anyMatch(a -> a.getAnnotationType().getSimpleName().equals("Service"));
    }

    private static boolean hasSpan(CtMethod<?> method) {
        boolean annotated = method.getAnnotations().stream()
                .anyMatch(a -> a.getAnnotationType().getSimpleName().equals("WithSpan"));
        if (annotated || method.getBody() == null) {
            return annotated;
        }
        List<CtInvocation<?>> calls = method.getBody().getElements(new TypeFilter<>(CtInvocation.class));
        return calls.stream().anyMatch(c -> c.getExecutable().getSimpleName().equals("spanBuilder"));
    }

    /** FleetService.turnoverIndex becomes fleet.turnover_index. */
    static String spanName(CtMethod<?> method) {
        String domain = method.getDeclaringType().getSimpleName().replaceFirst("Service$", "");
        String operation = method.getSimpleName().replaceAll("([a-z])([A-Z])", "$1_$2");
        return (domain + "." + operation).toLowerCase();
    }
}
