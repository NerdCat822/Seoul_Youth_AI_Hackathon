package kr.trylog.chat;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import kr.trylog.overview.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ChatController.class)
@WithMockUser
class ChatControllerTest {
    private static final Instant STARTED = Instant.parse("2026-11-21T00:12:00Z");
    private static final ChatRepository.Session SESSION = new ChatRepository.Session("c1", "쌀떡볶이 추천 표시",
            "e1", "쌀떡볶이에 사장님 추천 표시 붙이기", STARTED, STARTED.plusSeconds(11), 2, "137건이었어요.");

    @Autowired MockMvc mvc;
    @MockitoBean ChatRepository chats;
    @MockitoBean StoreRepository stores;

    @BeforeEach
    void selectStore() {
        when(stores.storeId()).thenReturn(1);
    }

    @Test
    void listsTheSelectedStoresConversationsWithIsoTimes() throws Exception {
        when(chats.sessions(1)).thenReturn(List.of(SESSION));
        mvc.perform(get("/api/v1/chats")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("c1"))
                .andExpect(jsonPath("$[0].experimentTitle").value("쌀떡볶이에 사장님 추천 표시 붙이기"))
                .andExpect(jsonPath("$[0].lastMessageAt").value("2026-11-21T00:12:11Z"))
                .andExpect(jsonPath("$[0].messageCount").value(2));
    }

    @Test
    void returnsMessagesInOrderAndWritesTheStoredPayloadAsJson() throws Exception {
        when(chats.session(1, "c1")).thenReturn(Optional.of(SESSION));
        when(chats.messages("c1")).thenReturn(List.of(
                new ChatRepository.Message(1, "USER", "효과가 있었을까요?", null, STARTED.plusSeconds(5)),
                new ChatRepository.Message(2, "ASSISTANT", "137건이었어요.",
                        "{\"type\": \"report\", \"targetMenuCode\": \"A011003\"}", STARTED.plusSeconds(11))));
        mvc.perform(get("/api/v1/chats/c1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.session.title").value("쌀떡볶이 추천 표시"))
                .andExpect(jsonPath("$.messages[0].role").value("USER"))
                .andExpect(jsonPath("$.messages[0].payload").value(nullValue()))
                .andExpect(jsonPath("$.messages[1].payload.targetMenuCode").value("A011003"))
                .andExpect(jsonPath("$.messages[1].createdAt").value("2026-11-21T00:12:11Z"));
    }

    @Test
    void anotherStoresOrUnknownConversationIsNotFound() throws Exception {
        when(chats.session(1, "other")).thenReturn(Optional.empty());
        mvc.perform(get("/api/v1/chats/other")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    private static final String THREAD = "0b6f3c1e-8a52-4d0b-9f1c-2a7d5e4c9b10";

    @Test
    void appendsAnExchangeAndKeepsThePayloadAsJson() throws Exception {
        when(stores.writeEnabled()).thenReturn(true);
        when(chats.append(eq(1), eq(THREAD), any(), any(), any())).thenReturn(SESSION);
        String body = """
                {"title":" 점심시간에 손님이 줄었어 ","experimentId":null,"messages":[
                 {"role":"USER","content":"점심시간에 손님이 줄었어","payload":null},
                 {"role":"ASSISTANT","content":"이런 시도는 어떠세요?","payload":{"options":["1번 해볼게요"]}}]}
                """;
        mvc.perform(post("/api/v1/chats/" + THREAD + "/messages").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value("c1"));
        verify(chats).append(1, THREAD, "점심시간에 손님이 줄었어", null, List.of(
                new ChatRepository.NewMessage("USER", "점심시간에 손님이 줄었어", null),
                new ChatRepository.NewMessage("ASSISTANT", "이런 시도는 어떠세요?", "{\"options\":[\"1번 해볼게요\"]}")));
    }

    @Test
    void rejectsHiddenSpeakersBadIdsAndEmptyExchangesBeforeWriting() throws Exception {
        when(stores.writeEnabled()).thenReturn(true);
        String message = "{\"messages\":[{\"role\":\"USER\",\"content\":\"안녕\"}]}";
        for (String[] request : new String[][]{
                {THREAD, message.replace("USER", "SYSTEM")}, {"not-a-uuid", message}, {THREAD, "{\"messages\":[]}"},
                {THREAD, message.replace("}]}", ",\"payload\":[1]}]}")}}) {
            mvc.perform(post("/api/v1/chats/" + request[0] + "/messages").with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content(request[1]))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        verify(chats, never()).append(any(Integer.class), any(), any(), any(), any());
    }

    @Test
    void readOnlyServiceDoesNotStoreConversations() throws Exception {
        when(stores.writeEnabled()).thenReturn(false);
        mvc.perform(post("/api/v1/chats/" + THREAD + "/messages").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"messages\":[{\"role\":\"USER\",\"content\":\"안녕\"}]}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("READ_ONLY"));
        verify(chats, never()).append(any(Integer.class), any(), any(), any(), any());
    }
}
