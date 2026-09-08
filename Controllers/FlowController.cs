using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Text.Json;

[ApiController]
[Route("api/[controller]")]
public class FlowsController : ControllerBase
{
    private readonly string _conn;

    public FlowsController(IConfiguration config)
    {
        _conn = $"Host={config["DB_HOST"]};" +
            $"Port={config["DB_PORT"]};" +
            $"Database={config["DB_NAME"]};" +
            $"Username={config["DB_USER"]};" +
            $"Password={config["DB_PASSWORD"]};" +
            $"SSL Mode=Require;Trust Server Certificate=true";
    }

    // GET api/flows — traer todos los flujos
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var flows = new List<object>();
        await using var con = new NpgsqlConnection(_conn);
        await con.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT id, name, created_at, data FROM flows ORDER BY created_at DESC", con);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            flows.Add(new
            {
                id = reader.GetString(0),
                name = reader.GetString(1),
                created = reader.GetInt64(2),
                data = JsonSerializer.Deserialize<object>(reader.GetString(3))
            });
        }
        return Ok(flows);
    }

    // POST api/flows — guardar o actualizar un flujo
    [HttpPost]
    public async Task<IActionResult> Save([FromBody] FlowDto dto)
    {
        await using var con = new NpgsqlConnection(_conn);
        await con.OpenAsync();
        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO flows (id, name, created_at, data, updated_at)
            VALUES (@id, @name, @created, @data::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE
            SET name = @name, data = @data::jsonb, updated_at = NOW()", con);

        cmd.Parameters.AddWithValue("id", dto.Id);
        cmd.Parameters.AddWithValue("name", dto.Name);
        cmd.Parameters.AddWithValue("created", dto.Created);
        cmd.Parameters.AddWithValue("data", JsonSerializer.Serialize(dto.Data));
        await cmd.ExecuteNonQueryAsync();
        return Ok(new { ok = true });
    }

    // DELETE api/flows/{id} — eliminar un flujo
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        await using var con = new NpgsqlConnection(_conn);
        await con.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "DELETE FROM flows WHERE id = @id", con);
        cmd.Parameters.AddWithValue("id", id);
        await cmd.ExecuteNonQueryAsync();
        return Ok(new { ok = true });
    }
}

public class FlowDto
{
    public string Id { get; set; }
    public string Name { get; set; }
    public long Created { get; set; }
    public object Data { get; set; }
}