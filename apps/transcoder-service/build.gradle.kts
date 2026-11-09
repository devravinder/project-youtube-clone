plugins {
    java
    jacoco
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.spring.dependency.management)
    alias(libs.plugins.spotless)
}

group = "dev.ytclone"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation(libs.spring.boot.starter.actuator)
    implementation(libs.spring.boot.starter.amqp)
    implementation(libs.spring.boot.starter.validation)
    implementation(libs.spring.boot.starter.webmvc)
  implementation(libs.spring.boot.starter.opentelemetry)
  implementation(libs.otel.logback.appender)
    implementation(platform(libs.aws.sdk.bom))
    implementation(libs.aws.sdk.s3)

    compileOnly(libs.spring.boot.configuration.processor)
    annotationProcessor(libs.spring.boot.configuration.processor)

    implementation(libs.mapstruct)
    annotationProcessor(libs.mapstruct.processor)

    // Lombok must run before MapStruct; the binding wires them together.
    compileOnly(libs.lombok)
    annotationProcessor(libs.lombok)
    annotationProcessor(libs.lombok.mapstruct.binding)

    testImplementation(libs.spring.boot.starter.actuator.test)
    testImplementation(libs.spring.boot.starter.amqp.test)
    testImplementation(libs.spring.boot.starter.validation.test)
    testImplementation(libs.spring.boot.starter.webmvc.test)
    testImplementation(libs.archunit)
    testRuntimeOnly(libs.junit.platform.launcher)
}

spotless {
    java {
        target("src/**/*.java")
        cleanthat().version(libs.versions.cleanthat.get())
        removeUnusedImports()
        importOrder()
        formatAnnotations()
        googleJavaFormat(libs.versions.google.java.format.get())
        trimTrailingWhitespace()
        endWithNewline()
    }
}

// Same as the reference project: format before every compile.
tasks.named("compileJava") {
    dependsOn("spotlessApply")
}

tasks.withType<Test> {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
    finalizedBy(tasks.jacocoTestReport)
}

jacoco {
    toolVersion = libs.versions.jacoco.get()
}

val coverageExcludes = listOf("**/TranscoderServiceApplication*", "**/*MapperImpl*")

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports { xml.required = true }
    classDirectories.setFrom(files(classDirectories.files.map { fileTree(it) { exclude(coverageExcludes) } }))
}

tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.test)
    classDirectories.setFrom(files(classDirectories.files.map { fileTree(it) { exclude(coverageExcludes) } }))
    violationRules {
        rule {
            limit {
                minimum = "0.75".toBigDecimal()
            }
        }
    }
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
}