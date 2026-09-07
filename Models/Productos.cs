using System.ComponentModel.DataAnnotations.Schema;

[Table("productos")]
public class Producto
{
    [Column("producto_id")]
    public int Id { get; set; }

    [Column("nombre")]
    public string Nombre { get; set; }

    // ... resto de columnas
}