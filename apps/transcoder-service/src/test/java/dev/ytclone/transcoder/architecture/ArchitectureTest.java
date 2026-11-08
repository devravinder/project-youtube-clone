package dev.ytclone.transcoder.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

@AnalyzeClasses(packages = "dev.ytclone.transcoder", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    private static final String DOMAIN = "dev.ytclone.transcoder.domain..";
    private static final String APPLICATION = "dev.ytclone.transcoder.application..";
    private static final String ADAPTER_IN = "dev.ytclone.transcoder.adapter.in..";
    private static final String ADAPTER_OUT = "dev.ytclone.transcoder.adapter.out..";

    @ArchTest
    static final ArchRule domainIsFreeOfFrameworksAndOuterLayers = noClasses()
            .that()
            .resideInAPackage(DOMAIN)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("org.springframework..", "jakarta..", APPLICATION, ADAPTER_IN, ADAPTER_OUT);

    @ArchTest
    static final ArchRule applicationDependsOnPortsNotOnAdaptersOrSpring = noClasses()
            .that()
            .resideInAPackage(APPLICATION)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("org.springframework..", "jakarta..", ADAPTER_IN, ADAPTER_OUT);

    @ArchTest
    static final ArchRule drivingAdaptersDoNotTouchDrivenAdapters = noClasses()
            .that()
            .resideInAPackage(ADAPTER_IN)
            .should()
            .dependOnClassesThat()
            .resideInAPackage(ADAPTER_OUT)
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule drivenAdaptersDoNotTouchDrivingAdapters = noClasses()
            .that()
            .resideInAPackage(ADAPTER_OUT)
            .should()
            .dependOnClassesThat()
            .resideInAPackage(ADAPTER_IN)
            .allowEmptyShould(true);
}
