package io.github.elhart05.bikeshare.instrumenter;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

import spoon.Launcher;
import spoon.support.sniper.SniperJavaPrettyPrinter;

/**
 * Applies {@link ServiceSpanRule} to a service, in a copy.
 *
 * <pre>
 *   mvn -f tools/spoon-instrumenter/pom.xml compile exec:java -Dexec.args=fleet
 *   mvn -f tools/spoon-instrumenter/target/fleet-instrumented/pom.xml clean package
 * </pre>
 *
 * <p>Run from the repository root. The sniper printer rewrites only what changed:
 * the rest of each file, comments included, stays as it was, so the diff against
 * the original is easy to read.</p>
 */
public final class Instrumenter {

    private Instrumenter() {
    }

    public static void main(String[] args) throws IOException {
        if (args.length != 1) {
            System.err.println("usage: Instrumenter <fleet|rentals>");
            System.exit(2);
        }
        Path source = Path.of(args[0]);
        Path target = Path.of("tools", "spoon-instrumenter", "target", args[0] + "-instrumented");
        copy(source, target);

        Launcher launcher = new Launcher();
        for (Path file : serviceFiles(source.resolve("src/main/java"))) {
            launcher.addInputResource(file.toString());
        }
        launcher.getEnvironment().setComplianceLevel(17);
        launcher.getEnvironment().setNoClasspath(true);
        launcher.getEnvironment().setCommentEnabled(true);
        launcher.getEnvironment().setAutoImports(true);
        launcher.getEnvironment().setPrettyPrinterCreator(
                () -> new SniperJavaPrettyPrinter(launcher.getEnvironment()));
        launcher.setSourceOutputDirectory(target.resolve("src/main/java").toString());
        launcher.addProcessor(new ServiceSpanRule());
        launcher.run();

        System.out.println("instrumented copy: " + target);
    }

    /**
     * Gives Spoon only the files the rule can apply to.
     *
     * <p>The Spoon 11.5.0 sniper printer fails on records ("CtRecordImpl does not
     * have CtRole.TYPE"). Service files declare none, except {@code Report}, which
     * is not a {@code @Service}. The rule then decides method by method, on the
     * model.</p>
     */
    private static List<Path> serviceFiles(Path sources) throws IOException {
        try (Stream<Path> files = Files.walk(sources)) {
            return files.filter(p -> p.toString().endsWith(".java"))
                        .filter(Instrumenter::declaresService)
                        .toList();
        }
    }

    private static boolean declaresService(Path file) {
        try {
            return Files.readString(file).contains("@Service");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** A full copy: Spoon then overwrites only the files it read. */
    private static void copy(Path source, Path target) throws IOException {
        if (Files.exists(target)) {
            try (Stream<Path> old = Files.walk(target)) {
                old.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
            }
        }
        try (Stream<Path> files = Files.walk(source)) {
            for (Path p : (Iterable<Path>) files::iterator) {
                Path relative = source.relativize(p);
                if (relative.startsWith("target")) {
                    continue;
                }
                Files.createDirectories(target.resolve(relative).getParent());
                if (Files.isRegularFile(p)) {
                    Files.copy(p, target.resolve(relative), StandardCopyOption.REPLACE_EXISTING);
                }
            }
        }
    }
}
