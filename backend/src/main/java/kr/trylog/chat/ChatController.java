package kr.trylog.chat;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import kr.trylog.overview.StoreRepository;
import kr.trylog.shared.InvalidInputException;
import kr.trylog.shared.NotFoundException;
import kr.trylog.shared.ReadOnlyException;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/chats")
public class ChatController {
    private static final Pattern UUID = Pattern.compile("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}");
    private static final int PAYLOAD_MAX = 20_000;
    private final ChatRepository chats;
    private final StoreRepository stores;

    public ChatController(ChatRepository chats, StoreRepository stores) {
        this.chats = chats;
        this.stores = stores;
    }

    /** Only the two visible speakers can be written through the API. SYSTEM rows are for the agent's own use. */
    public enum Speaker { USER, ASSISTANT }

    public record NewMessage(
            @NotNull(message = "말한 쪽을 알려주세요.") Speaker role,
            @NotNull(message = "내용을 입력해주세요.")
            @Size(max = 4000, message = "메시지는 4000자 이내로 입력해주세요.") String content,
            JsonNode payload) { }

    public record Exchange(
            @Size(max = 120, message = "제목은 120자 이내로 입력해주세요.") String title,
            @Size(max = 36, message = "시도 ID를 확인해주세요.") String experimentId,
            @NotEmpty(message = "저장할 메시지가 없어요.")
            @Size(max = 10, message = "한 번에 10개까지 저장할 수 있어요.") List<@Valid @NotNull NewMessage> messages) { }

    @GetMapping
    @Transactional(readOnly = true)
    public List<ChatRepository.Session> list() {
        stores.storeName();
        return chats.sessions(stores.storeId());
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ChatRepository.Conversation find(@PathVariable String id) {
        // Another store's conversation is reported as missing, like another store's experiment.
        var session = chats.session(stores.storeId(), id)
                .orElseThrow(() -> new NotFoundException("대화를 찾을 수 없어요."));
        return new ChatRepository.Conversation(session, chats.messages(id));
    }

    /** Appends one exchange (what the owner said and what was shown in reply) to the conversation. */
    @PostMapping("/{id}/messages")
    @Transactional
    public ResponseEntity<ChatRepository.Session> append(@PathVariable String id, @Valid @RequestBody Exchange exchange) {
        if (!UUID.matcher(id).matches()) {
            throw new InvalidInputException(Map.of("id", "대화 ID는 UUID 형식이어야 해요."));
        }
        for (NewMessage message : exchange.messages()) {
            if (message.payload() != null && !message.payload().isNull()
                    && (!message.payload().isObject() || message.payload().toString().length() > PAYLOAD_MAX)) {
                throw new InvalidInputException(Map.of("payload", "부가 내용은 20000자 이내의 JSON 객체로 보내주세요."));
            }
        }
        if (!stores.writeEnabled()) {
            throw new ReadOnlyException();
        }
        stores.storeName();
        String title = exchange.title() == null ? "" : exchange.title().strip();
        var saved = chats.append(stores.storeId(), id.toLowerCase(), title, exchange.experimentId(),
                exchange.messages().stream().map(message -> new ChatRepository.NewMessage(message.role().name(),
                        message.content(), message.payload() == null || message.payload().isNull()
                                ? null : message.payload().toString())).toList());
        return ResponseEntity.created(URI.create("/api/v1/chats/" + saved.id())).body(saved);
    }
}
