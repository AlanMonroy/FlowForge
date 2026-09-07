using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var config = builder.Configuration;
var connectionString = $"Host={config["DB_HOST"]};" +
                        $"Port={config["DB_PORT"]};" +
                        $"Database={config["DB_NAME"]};" +
                        $"Username={config["DB_USER"]};" +
                        $"Password={config["DB_PASSWORD"]};" +
                        $"SSL Mode=Require;Trust Server Certificate=true";

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));


// Add services to the container.
builder.Services.AddControllersWithViews();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();

app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.MapGet("/test-db", async (AppDbContext db) =>
{
    var productos = await db.Productos.Take(5).ToListAsync();
    return Results.Ok(productos);
});


app.Run();
