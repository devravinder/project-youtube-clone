package dev.ytclone.transcoder;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

// No broker in tests: the listener stays stopped and the rabbit health check is off.
@SpringBootTest(
    properties = {
      "spring.rabbitmq.listener.simple.auto-startup=false",
      "management.health.rabbit.enabled=false"
    })
@AutoConfigureMockMvc
class TranscoderServiceApplicationTests {

  @Autowired MockMvc mockMvc;

  @Test
  void healthReportsUp() throws Exception {
    mockMvc
        .perform(get("/actuator/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"));
  }

  @Test
  void exposesKubernetesProbes() throws Exception {
    mockMvc
        .perform(get("/actuator/health/liveness"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"));
    mockMvc
        .perform(get("/actuator/health/readiness"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"));
  }

  @Test
  void doesNotExposeOtherActuatorEndpoints() throws Exception {
    mockMvc.perform(get("/actuator/env")).andExpect(status().isNotFound());
    mockMvc.perform(get("/actuator/beans")).andExpect(status().isNotFound());
  }
}
